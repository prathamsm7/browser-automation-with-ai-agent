import { chromium } from 'playwright';
import OpenAI from 'openai';

// Global browser and page instances
export let globalBrowser = null;
export let globalPage = null;

// Initialize OpenAI client
export const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to check if browser is available
export function checkBrowserAvailable() {
    if (!globalPage) {
        return {
            success: false,
            error: 'No browser page available. Please open a browser first.',
            message: 'Browser not initialized'
        };
    }
    return null;
}

// Function to set global browser instances
export function setGlobalBrowser(browser, page) {
    globalBrowser = browser;
    globalPage = page;
}

// Function to close browser
export async function closeBrowser() {
    if (globalBrowser) {
        await globalBrowser.close();
        globalBrowser = null;
        globalPage = null;
    }
}
