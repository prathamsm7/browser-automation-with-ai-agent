import 'dotenv/config';
import { Agent, run } from '@openai/agents';
import { CHAICODE_AUTOMATION_PROMPT_SIGNUP } from './prompts/chaicode.js';
import { SYSTEM_PROMPT } from './prompts/system.js';
import {
    takeScreenshotAndAnalyze,
    openBrowser,
    smartClick,
    fillFieldByDescription,
    validateForm,
    scrollPage,
} from './tools/tools.js';
import { globalBrowser, globalPage, closeBrowser } from './shared/dependencies.js';

// ============================================================================
// AI AGENT CONFIGURATION
// ============================================================================

const websiteAutomationAgent = new Agent({
    name: 'Website Automation Agent',
    instructions: SYSTEM_PROMPT,
    tools: [
        takeScreenshotAndAnalyze,
        openBrowser,
        smartClick,
        fillFieldByDescription,
        validateForm,
        scrollPage,
    ],
});

async function chatWithAgent(prompt) {
    try {
        console.log('🤖 Starting AI Browser Automation Agent...');
        console.log('==========================================');
        
        const result = await run(websiteAutomationAgent, prompt, {
            maxTurns: 20, // Increased to allow more attempts for scrolling
            timeout: 120000 // Increased timeout to 2 minutes
        });
        
        console.log('\n🎉 Automation completed!');
        console.log('========================');
        console.log(`Final Output: ${result.finalOutput}`);
        
        return result;
    } catch (error) {
        console.error('❌ Error during automation:', error);
        throw error;
    } finally {
        // Clean up browser resources
        await closeBrowser();
            console.log('🧹 Browser closed');
    }
}

// Handle process termination
process.on('SIGINT', async () => {
    await closeBrowser();
        console.log('Browser closed on exit');
    process.exit(0);
});

chatWithAgent(CHAICODE_AUTOMATION_PROMPT_SIGNUP);
