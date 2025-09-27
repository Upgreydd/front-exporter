import needle, { NeedleResponse } from 'needle';
import { Logger } from "./logging";

var colors = require('@colors/colors');
export const log = Logger.getLogger("C");

// Interface for tracking rate limit information from API headers
interface RateLimitInfo {
    limit: number;              // x-ratelimit-limit: Maximum requests per minute
    remaining: number;          // x-ratelimit-remaining: Requests left in current window
    reset: number;              // x-ratelimit-reset: UNIX timestamp when limit resets
    burstLimit?: number;        // x-ratelimit-burst-limit: Additional burst allowance
    burstRemaining?: number;    // x-ratelimit-burst-remaining: Burst requests remaining
    retryAfter?: number;        // retry-after: Seconds to wait before retry (when rate limited)
    frontTier?: number;         // x-front-tier: Tier-specific rate limiting
}

import 'dotenv/config';
import * as env from 'env-var';
export const API_KEY = env.get('API_KEY').required().asString();

export class FrontConnector {
    static readonly headers = {
        Authorization: `Bearer ${API_KEY}`,
        Accept: `message/rfc822` // This is the MIME type for .eml files
    };

    // Track current rate limit status
    private static currentRateLimit: RateLimitInfo | null = null;
    private static lastRateLimitWarning = 0;
    private static requestCount = 0;

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

            // Make the request and handle rate limiting once per request
            response = await needle('get', url, null, options);
            await this.handleRateLimiting(response);

            // If we got rate limited, the handleRateLimiting already waited,
            // so we don't need a do-while loop
            if (response.statusCode === 429) {
                // After waiting, make one more attempt
                response = await needle('get', url, null, options);
                await this.handleRateLimiting(response);
            }

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

    // Comprehensive rate limit monitoring and handling
    // See: https://dev.frontapp.com/docs/rate-limiting#monitor-your-rate-limit-with-api-headers
    private static async handleRateLimiting(res: NeedleResponse): Promise<void> {
        // Extract all rate limit headers
        const rateLimitInfo: RateLimitInfo = {
            limit: this.parseHeaderInt(res, 'x-ratelimit-limit') || 50, // Default to 50 rpm
            remaining: this.parseHeaderInt(res, 'x-ratelimit-remaining') || 0,
            reset: this.parseHeaderInt(res, 'x-ratelimit-reset') || 0,
            burstLimit: this.parseHeaderInt(res, 'x-ratelimit-burst-limit'),
            burstRemaining: this.parseHeaderInt(res, 'x-ratelimit-burst-remaining'),
            retryAfter: this.parseHeaderInt(res, 'retry-after'),
            frontTier: this.parseHeaderInt(res, 'x-front-tier')
        };

        // Update our tracking
        this.currentRateLimit = rateLimitInfo;
        this.requestCount++;

        // Handle 429 Too Many Requests FIRST to avoid multiple processing
        if (res.statusCode === 429) {
            await this.handleRateLimitExceeded(rateLimitInfo);
            return;
        }

        // Log status and proactive management only for successful requests
        this.logRateLimitStatus(rateLimitInfo);
        await this.proactiveRateLimitManagement(rateLimitInfo);
    }

    // Handle when rate limit is exceeded (429 response)
    private static async handleRateLimitExceeded(rateLimitInfo: RateLimitInfo): Promise<void> {
        const waitTimeSeconds = rateLimitInfo.retryAfter || 60;

        // Single clear message about rate limit
        if (rateLimitInfo.remaining && rateLimitInfo.remaining > 0) {
            console.log(colors.red.bold(`⚠️  Burst rate limit exceeded (Tier ${rateLimitInfo.frontTier || '?'}). Waiting ${waitTimeSeconds}s...`));
        } else {
            console.log(colors.red.bold(`🚫 Rate limit exceeded (${rateLimitInfo.remaining}/${rateLimitInfo.limit}). Waiting ${waitTimeSeconds}s...`));
        }

        // Log once for debugging
        log.debug(`Rate limit exceeded. Waiting ${waitTimeSeconds} seconds.`);

        // Single countdown without overlapping messages
        await this.showCountdown(waitTimeSeconds);
    }

    // Proactive management to avoid hitting rate limits
    private static async proactiveRateLimitManagement(rateLimitInfo: RateLimitInfo): Promise<void> {
        const remainingPercentage = (rateLimitInfo.remaining / rateLimitInfo.limit) * 100;
        const timeUntilReset = rateLimitInfo.reset ? (rateLimitInfo.reset * 1000) - Date.now() : 60000;
        const secondsUntilReset = Math.max(0, Math.floor(timeUntilReset / 1000));

        // Only show message once when getting very low
        if (remainingPercentage < 10 && rateLimitInfo.remaining > 0) {
            const delayMs = Math.max(500, (60 - secondsUntilReset) * 50);

            // Only log this warning once per minute to avoid spam
            const now = Date.now();
            if ((now - this.lastRateLimitWarning) > 60000) {
                console.log(colors.yellow(`⚠️  Low API quota: ${rateLimitInfo.remaining}/${rateLimitInfo.limit}. Slowing down...`));
                this.lastRateLimitWarning = now;
            }

            await new Promise(resolve => setTimeout(resolve, delayMs));
        } else if (remainingPercentage < 20 && rateLimitInfo.remaining > 0) {
            // Silent adaptive delay for medium-low requests
            const delayMs = Math.max(100, (60 - secondsUntilReset) * 10);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }    // Log rate limit status with intelligent frequency
    private static logRateLimitStatus(rateLimitInfo: RateLimitInfo): void {
        const now = Date.now();
        const remainingPercentage = (rateLimitInfo.remaining / rateLimitInfo.limit) * 100;

        // Much more conservative logging: only when very low or every 2 minutes
        const shouldLog = remainingPercentage < 15 ||
            (now - this.lastRateLimitWarning) > 120000; // 2 minutes

        if (shouldLog) {
            const statusColor = remainingPercentage > 25 ? colors.yellow : colors.red;
            console.log(statusColor(`📊 Rate Limit: ${rateLimitInfo.remaining}/${rateLimitInfo.limit} remaining (${remainingPercentage.toFixed(0)}%)`));

            log.debug(`Rate limit status: ${rateLimitInfo.remaining}/${rateLimitInfo.limit} (${remainingPercentage.toFixed(1)}%)`);
            this.lastRateLimitWarning = now;
        }
    }    // Show countdown for long waits
    private static async showCountdown(seconds: number): Promise<void> {
        // Clear any existing line first
        process.stdout.write('\r\x1b[K');

        for (let i = seconds; i > 0; i--) {
            const mins = Math.floor(i / 60);
            const secs = i % 60;
            const secsStr = secs < 10 ? `0${secs}` : `${secs}`;
            const timeStr = mins > 0 ? `${mins}:${secsStr}` : `${secs}s`;

            // Clear line and write new countdown
            process.stdout.write(`\r\x1b[K${colors.cyan('⏳')} Waiting ${timeStr}...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Clear countdown line and show ready message
        process.stdout.write('\r\x1b[K');
        console.log(colors.green('✅ Resuming requests'));
    }    // Get current rate limit status for external monitoring
    public static getCurrentRateLimit(): RateLimitInfo | null {
        return this.currentRateLimit;
    }

    // Get a summary of rate limit usage
    public static getRateLimitSummary(): string {
        if (!this.currentRateLimit) {
            return 'No rate limit information available';
        }

        const rl = this.currentRateLimit;
        const percentage = ((rl.limit - rl.remaining) / rl.limit * 100).toFixed(1);
        return `Used ${rl.limit - rl.remaining}/${rl.limit} requests (${percentage}%). ${rl.remaining} remaining.`;
    }

    private static parseHeaderInt(res: NeedleResponse, key: string): number | undefined {
        const value = res.headers[key] as string;
        if (!value) return undefined;

        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? undefined : parsed;
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
