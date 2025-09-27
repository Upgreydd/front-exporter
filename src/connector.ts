import needle, { NeedleResponse } from 'needle';
import { Logger } from "./logging";

var colors = require('@colors/colors');
export const log = Logger.getLogger("C");

import 'dotenv/config';
import * as env from 'env-var';
export const API_KEY = env.get('API_KEY').required().asString();

export class FrontConnector {
    static readonly headers = {
        Authorization: `Bearer ${API_KEY}`,
        Accept: `message/rfc822` // This is the MIME type for .eml files
    };

    // Aggregates API resources from a resource url and any subsequent _pagination.next urls
    public static async makePaginatedAPIRequest<T>(url: string, resources: T[] = []): Promise<T[]> {
        try {
            let response = await this.makeRateLimitedRequest('get', url);

            // Validate response body
            if (!response.body || !response.body._results) {
                log.warn(`Invalid response body from ${url}. Response: ${JSON.stringify(response.body)}`);
                throw new Error('Invalid response body: missing _results');
            }

            // We expect _results to be an array of API resources that match the type specified
            // Caution: Runtime typecasting
            for (const item of response.body._results as T[]) {
                resources.push(item);
            }

            // If the response has a next URL, call it
            // This URL will include the query string of the base call
            if (response.body._pagination?.next) {
                log.debug(`Fetching next page: ${response.body._pagination.next}`);
                return await this.makePaginatedAPIRequest(response.body._pagination.next, resources);
            } else {
                log.debug(`Completed paginated request. Total resources: ${resources.length}`);
                return resources;
            }
        } catch (error: any) {
            log.error(`Failed to make paginated API request to ${url}: ${error.message}`);
            throw error;
        }
    }

    // Memory-efficient paginated processing with callback for each batch
    public static async processPaginatedAPIRequest<T>(
        url: string,
        processCallback: (items: T[], isLastBatch: boolean) => Promise<void>
    ): Promise<void> {
        try {
            let currentUrl: string | null = url;
            let totalProcessed = 0;

            while (currentUrl) {
                const response = await this.makeRateLimitedRequest('get', currentUrl);

                // Validate response body
                if (!response.body || !response.body._results) {
                    log.warn(`Invalid response body from ${currentUrl}. Response: ${JSON.stringify(response.body)}`);
                    throw new Error('Invalid response body: missing _results');
                }

                const items = response.body._results as T[];
                totalProcessed += items.length;
                const isLastBatch = !response.body._pagination?.next;

                log.debug(`Processing batch of ${items.length} items. Total processed: ${totalProcessed}`);

                // Process this batch
                await processCallback(items, isLastBatch);

                // Move to next page
                currentUrl = response.body._pagination?.next || null;

                // Allow some time for garbage collection between batches
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            log.debug(`Completed paginated processing. Total processed: ${totalProcessed}`);
        } catch (error: any) {
            log.error(`Failed to process paginated API request to ${url}: ${error.message}`);
            throw error;
        }
    }

    private static async makeRateLimitedRequest(method: string, url: string, retryCount = 0): Promise<NeedleResponse> {
        const maxRetries = 3;
        const options = {
            headers: this.headers,
            read_timeout: 30000,  // 30 second timeout
            open_timeout: 10000,  // 10 second connection timeout
            response_timeout: 60000 // 60 second response timeout
        };

        log.debug(`Querying API... ${url} (attempt ${retryCount + 1})`);

        try {
            let response: NeedleResponse;
            do {
                response = await needle('get', url, null, options);
                await this.handleRateLimiting(response);
            } while (response.statusCode === 429);

            // Check for successful response
            if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
                return response;
            } else {
                throw new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`);
            }
        } catch (error: any) {
            log.warn(`Request failed for ${url}: ${error.message}`);

            // Retry on network errors
            if (retryCount < maxRetries && this.isRetryableError(error)) {
                const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
                log.warn(`Retrying in ${delay}ms... (${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.makeRateLimitedRequest(method, url, retryCount + 1);
            }

            throw error;
        }
    }

    private static isRetryableError(error: any): boolean {
        // Retry on connection errors, timeouts, and server errors
        return error.code === 'ECONNRESET' ||
            error.code === 'ECONNREFUSED' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ENOTFOUND' ||
            error.code === 'EAI_AGAIN' ||
            (error.statusCode && error.statusCode >= 500);
    }

    // Please see https://dev.frontapp.com/docs/rate-limiting for additional rate-limiting details
    private static async handleRateLimiting(res: NeedleResponse): Promise<any> {
        const requestsRemaining = this.parseHeaderInt(res, 'x-ratelimit-remaining');
        const retryAfterMillis = 1000 * this.parseHeaderInt(res, 'retry-after');

        // If there's no 'retry-after', return early
        if (!retryAfterMillis) {
            return;
        }

        // If there are requests remaining, but we saw a 429 status, then we hit a burst limit:
        // https://dev.frontapp.com/docs/rate-limiting#additional-burst-rate-limiting
        if (requestsRemaining > 0) {
            const burstLimitTier = this.parseHeaderInt(res, 'x-front-tier');
            console.log(colors.red(`Tier ${burstLimitTier} resource burst limit reached`));
        }
        // Otherwise, if remaining is 0, we simply ran out of global requests.
        else {
            const globalLimit = this.parseHeaderInt(res, 'x-ratelimit-limit');
            console.log(colors.red(`Global rate limit of ${globalLimit} reached`));
        }
        // Either way, wait for retry-after
        return new Promise(resolve => {
            setTimeout(resolve, retryAfterMillis);
        });
    }

    private static parseHeaderInt(res: NeedleResponse, key: string) {
        const value = res.headers[key] as string;
        return parseInt(value);
    }

    public static async getAttachmentFromURL(url: string): Promise<Buffer> {
        let response = await this.makeRateLimitedRequest('get', url);
        return response.body;
    }

    // Get the message content so it can be exported to a .eml file
    public static async getMessageFromURL(url: string): Promise<Buffer> {
        let response = await this.makeRateLimitedRequest('get', url);
        return response.body;
    }
}
