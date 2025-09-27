import { tool } from '@openai/agents';
import { z } from 'zod';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { globalPage, globalBrowser, openai, checkBrowserAvailable, setGlobalBrowser } from '../shared/dependencies.js';

const takeScreenshotAndAnalyze = tool({
    name: 'take_screenshot_and_analyze',
    description: 'Take screenshot and analyze it to find specific elements using AI vision',
    parameters: z.object({
        targetElement: z.string().nullable().optional().describe('What element to look for (e.g., "Continue button", "email field", "Sign Up form")'),
        analysisType: z.string().nullable().optional().describe('Type of analysis needed (e.g., "form fields", "buttons", "navigation")')
    }),
    async execute({ targetElement, analysisType }) {
        try {
            console.log('📸 Taking screenshot and analyzing...');

            const browserCheck = checkBrowserAvailable();
            if (browserCheck) return browserCheck;

            const buffer = await globalPage.screenshot({
                type: 'png',
                fullPage: true
            });

            // Create screenshots directory if it doesn't exist
            const screenshotsDir = path.join(process.cwd(), 'screenshots');
            if (!fs.existsSync(screenshotsDir)) {
                fs.mkdirSync(screenshotsDir, { recursive: true });
            }

            // Save screenshot to file
            const timestamp = Date.now();
            const filename = `screenshot-${timestamp}${targetElement ? `-${targetElement.replace(/\s+/g, '-')}` : ''}.png`;
            const filePath = path.join(screenshotsDir, filename);
            await fs.promises.writeFile(filePath, buffer);

            console.log(`Screenshot saved as ${filename}`);

            let analysis = null;

            if (targetElement) {
                try {
                    console.log(`🔍 Analyzing screenshot for: "${targetElement}"`);
                    const base64Image = buffer.toString('base64');

                    const response = await openai.chat.completions.create({
                        model: 'gpt-4o-mini',
                        messages: [
                            {
                                role: 'user',
                                content: [
                                    {
                                        type: 'text',
                                        text: `You are a web automation assistant. Analyze this screenshot and locate the "${targetElement}".

CRITICAL: You MUST respond with ONLY valid JSON. No additional text, explanations, or markdown formatting.

Required JSON format:
{
    "elementFound": true/false,
    "elementType": "button|input|link|form|other",
    "coordinates": {"x": number, "y": number},
    "textContent": "exact visible text",
    "cssSelector": "specific CSS selector like button[type='submit'] or .class-name",
    "description": "brief description",
    "formFields": [
        {
            "name": "field name", 
            "type": "email|password|text|number|tel", 
            "coordinates": {"x": number, "y": number},
            "cssSelector": "input[type='email'] or input[name='email']"
        }
    ]
}

Instructions:
1. Look for the "${targetElement}" in the screenshot
2. Provide the EXACT visible text content (case-sensitive)
3. Provide a SPECIFIC CSS selector (not generic like 'button')
4. If it's a form, list all visible input fields with their coordinates AND CSS selectors
5. For form fields, specify the exact input type (email, password, text, etc.)
6. Coordinates should be approximate center of the element
7. Focus on accuracy over speed

Examples of good CSS selectors:
- button[type="submit"]
- .sign-up-button
- #login-form button
- a[href*="signup"]
- input[name="email"]

Respond with ONLY the JSON object, no other text.`,
                                    },
                                    {
                                        type: 'image_url',
                                        image_url: {
                                            url: `data:image/png;base64,${base64Image}`,
                                        },
                                    },
                                ],
                            },
                        ],
                        max_tokens: 800,
                        temperature: 0.1, // Lower temperature for more consistent JSON output
                    });

                    analysis = response.choices[0].message.content;
                    console.log('🤖 Visual analysis completed', analysis);

                    // Enhanced JSON parsing with fallback
                    try {
                        // First, try to parse the response directly
                        const parsedAnalysis = JSON.parse(analysis);
                        analysis = parsedAnalysis;
                        console.log('✅ Successfully parsed JSON analysis');
                    } catch (parseError) {
                        console.log('⚠️ Direct JSON parsing failed, attempting to extract JSON...');

                        // Try to extract JSON from the response text
                        const jsonMatch = analysis.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            try {
                                const extractedJson = JSON.parse(jsonMatch[0]);
                                analysis = extractedJson;
                                console.log('✅ Successfully extracted and parsed JSON');
                            } catch (extractError) {
                                console.log('❌ Could not extract valid JSON, keeping as text');
                                analysis = {
                                    error: 'Failed to parse JSON',
                                    rawResponse: analysis,
                                    elementFound: false
                                };
                            }
                        } else {
                            console.log('❌ No JSON found in response, creating fallback analysis');
                            analysis = {
                                error: 'No JSON found in response',
                                rawResponse: analysis,
                                elementFound: false,
                                description: analysis.substring(0, 200) + '...'
                            };
                        }
                    }

                } catch (error) {
                    console.log('❌ Vision analysis failed:', error.message);
                    analysis = { error: error.message };
                }
            }

            return {
                success: true,
                message: `Screenshot saved as ${filename}`,
                filePath: filePath,
                analysis: analysis,
                targetElement: targetElement
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                message: 'Failed to take screenshot and analyze'
            };
        }
    },
});

const openBrowser = tool({
    name: 'open_browser',
    description: 'Opens a browser and navigates to the specified URL',
    parameters: z.object({
        url: z.string().describe('The URL to navigate to'),
        waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).default('load').describe('When to consider navigation successful')
    }),
    async execute(input) {
        try {
            console.log('🌐 Opening browser for URL:', input.url);

            // Close existing browser if it exists
            if (globalBrowser) {
                await globalBrowser.close();
            }

            // Create new browser instance
            const browser = await chromium.launch({
                headless: false,
                chromiumSandbox: true,
                args: ['--disable-extensions', '--disable-file-system'],
            });

            const page = await browser.newPage();
            
            // Set global instances
            setGlobalBrowser(browser, page);
            console.log('🌐 Navigating to:', input.url);

            await globalPage.goto(input.url, {
                waitUntil: input.waitUntil,
                timeout: 30000
            });

            return {
                success: true,
                message: `Browser opened and navigated to ${input.url}`,
                url: input.url
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                message: `Failed to open browser or navigate to ${input.url}`
            };
        }
    },
});

const fillFieldByDescription = tool({
    name: 'fill_field_by_description',
    description: 'Finds and fills form fields based on natural language descriptions (e.g., "email address", "first name", "phone number")',
    parameters: z.object({
        fieldDescription: z.string().describe('Natural language description of the field to fill (e.g., "email address", "first name", "phone number", "password")'),
        value: z.string().describe('Value to fill in the field')
    }),
    async execute(input) {
        try {
            console.log(`🔍 Looking for field: "${input.fieldDescription}"`);

            const browserCheck = checkBrowserAvailable();
            if (browserCheck) return browserCheck;

            // Find all input elements and analyze them
            const inputs = await globalPage.$$eval('input, textarea, select', elements =>
                elements.map((el, index) => {
                    const label = document.querySelector(`label[for="${el.id}"]`);
                    const labelText = label ? label.textContent.trim() : '';

                    return {
                        index: index,
                        tagName: el.tagName.toLowerCase(),
                        type: el.type || 'text',
                        name: el.name || '',
                        id: el.id || '',
                        placeholder: el.placeholder || '',
                        labelText: labelText,
                        className: el.className || '',
                        value: el.value || '',
                        required: el.required || false
                    };
                })
            );

            // Smart field matching based on description
            const description = input.fieldDescription.toLowerCase();
            let bestMatch = null;
            let bestScore = 0;

            for (const inputEl of inputs) {
                let score = 0;
                const fieldText = `${inputEl.name} ${inputEl.placeholder} ${inputEl.labelText} ${inputEl.id}`.toLowerCase();

                // Type-based matching
                if (description.includes('email') && (inputEl.type === 'email' || fieldText.includes('email'))) {
                    score += 15;
                }

                // Enhanced password field matching to distinguish between password and confirm password
                if (description.includes('password')) {
                    if (inputEl.type === 'password') {
                        // Check if this is specifically a confirm password field
                        const isConfirmPassword = fieldText.includes('confirm') ||
                            fieldText.includes('verify') ||
                            fieldText.includes('repeat') ||
                            fieldText.includes('retype') ||
                            fieldText.includes('confirmpassword') ||
                            fieldText.includes('confirm_password');

                        // Check if user is asking for confirm password specifically
                        const isAskingForConfirm = description.includes('confirm') ||
                            description.includes('verify') ||
                            description.includes('repeat') ||
                            description.includes('retype');

                        if (isAskingForConfirm && isConfirmPassword) {
                            score += 25; // Higher score for confirm password when specifically requested
                        } else if (!isAskingForConfirm && !isConfirmPassword) {
                            score += 20; // Higher score for regular password when not asking for confirm
                        } else if (isAskingForConfirm && !isConfirmPassword) {
                            score += 5; // Lower score for regular password when asking for confirm
                        } else if (!isAskingForConfirm && isConfirmPassword) {
                            score += 5; // Lower score for confirm password when asking for regular password
                        } else {
                            score += 15; // Default score for any password field
                        }
                    } else if (fieldText.includes('password')) {
                        score += 10; // Lower score for non-password type fields that contain "password"
                    }
                }

                if (description.includes('phone') && (inputEl.type === 'tel' || fieldText.includes('phone') || fieldText.includes('mobile'))) {
                    score += 15;
                }

                // Label text matching (highest priority)
                if (inputEl.labelText && inputEl.labelText.toLowerCase().includes(description)) {
                    score += 20;
                }

                // Placeholder text matching
                if (inputEl.placeholder && inputEl.placeholder.toLowerCase().includes(description)) {
                    score += 18;
                }

                // Name attribute matching
                if (inputEl.name && inputEl.name.toLowerCase().includes(description.replace(/\s+/g, ''))) {
                    score += 16;
                }

                // Common field pattern matching
                const patterns = {
                    'first name': ['first', 'fname', 'given'],
                    'last name': ['last', 'lname', 'surname', 'family'],
                    'email': ['email', 'e-mail', 'mail'],
                    'password': ['password', 'pass', 'pwd'],
                    'confirm password': ['confirm', 'verify', 'repeat', 'retype', 'confirmpassword', 'confirm_password'],
                    'username': ['username', 'user', 'login']
                };

                for (const [pattern, keywords] of Object.entries(patterns)) {
                    if (description.includes(pattern)) {
                        for (const keyword of keywords) {
                            if (fieldText.includes(keyword)) {
                                score += 10;
                            }
                        }
                    }
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = inputEl;
                }
            }

            if (!bestMatch || bestScore < 3) {
                console.log(`❌ No suitable field found for "${input.fieldDescription}"`);
                console.log('📋 Available fields on the page:');
                inputs.forEach((field, i) => {
                    const fieldInfo = [
                        field.name && `name="${field.name}"`,
                        field.placeholder && `placeholder="${field.placeholder}"`,
                        field.labelText && `label="${field.labelText}"`,
                        field.id && `id="${field.id}"`
                    ].filter(Boolean).join(', ');
                    console.log(`  ${i + 1}. ${field.type} field (${fieldInfo})`);
                });

                return {
                    success: false,
                    error: `No suitable field found for "${input.fieldDescription}"`,
                    message: `Could not find a field matching "${input.fieldDescription}". Try using more specific descriptions.`,
                    availableFields: inputs.map(i => ({
                        name: i.name,
                        placeholder: i.placeholder,
                        type: i.type,
                        label: i.labelText,
                        id: i.id
                    }))
                };
            }

            console.log(`🎯 Found field: ${bestMatch.name || bestMatch.placeholder || bestMatch.type} (score: ${bestScore})`);

            // Fill the field using Playwright's built-in fill method with enhanced validation
            const selector = bestMatch.id ? `#${bestMatch.id}` :
                bestMatch.name ? `[name="${bestMatch.name}"]` :
                    `input[type="${bestMatch.type}"]`;

            const locator = globalPage.locator(selector);

            // Clear the field first to prevent concatenation issues
            await locator.clear();
            await globalPage.waitForTimeout(100);

            // Fill the field
            await locator.fill(input.value);
            await globalPage.waitForTimeout(100);

            console.log(`✅ Filled "${input.fieldDescription}" with: "${input.value}"`);

            // Enhanced validation - try multiple times if needed
            let filledValue = await locator.inputValue();
            let isValid = filledValue === input.value;
            let attempts = 0;
            const maxAttempts = 3;

            while (!isValid && attempts < maxAttempts) {
                attempts++;
                console.log(`⚠️ Validation failed (attempt ${attempts}/${maxAttempts}). Expected: "${input.value}", Got: "${filledValue}"`);

                // Clear and refill
                await locator.clear();
                await globalPage.waitForTimeout(100);
                await locator.fill(input.value);
                await globalPage.waitForTimeout(100);

                filledValue = await locator.inputValue();
                isValid = filledValue === input.value;
            }

            // Final validation
            if (!isValid) {
                console.log(`❌ Failed to fill "${input.fieldDescription}" after ${maxAttempts} attempts`);
                console.log(`   Expected: "${input.value}"`);
                console.log(`   Actual: "${filledValue}"`);
                console.log(`   Field selector: "${selector}"`);
            }

            return {
                success: isValid,
                message: isValid
                    ? `Successfully filled "${input.fieldDescription}" with: "${input.value}"`
                    : `Failed to fill "${input.fieldDescription}" after ${maxAttempts} attempts. Expected: "${input.value}", Got: "${filledValue}"`,
                fieldFound: bestMatch.name || bestMatch.placeholder || bestMatch.type,
                expectedValue: input.value,
                actualValue: filledValue,
                isValid: isValid,
                attempts: attempts
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                message: `Failed to fill field "${input.fieldDescription}"`
            };
        }
    },
});

const validateForm = tool({
    name: 'validate_form',
    description: 'Checks current form field values and validates they are filled correctly',
    parameters: z.object({}),
    async execute(input) {
        try {
            console.log('✅ Checking form field values...');

            const browserCheck = checkBrowserAvailable();
            if (browserCheck) return browserCheck;

            // Get all input values
            const inputValues = await globalPage.$$eval('input, textarea, select', elements =>
                elements.map((el, index) => ({
                    index: index,
                    type: el.type || 'text',
                    name: el.name || '',
                    placeholder: el.placeholder || '',
                    value: el.value || '',
                    tagName: el.tagName.toLowerCase(),
                    required: el.required || false
                }))
            );

            console.log('📋 Current form field values:');
            inputValues.forEach((input, i) => {
                const fieldName = input.name || input.placeholder || 'unnamed';
                const status = input.value ? '✅' : '❌';
                console.log(`  ${i + 1}. ${status} ${input.type} field (${fieldName}): "${input.value}"`);
            });

            // Check if required fields are filled
            const requiredFields = inputValues.filter(field => field.required);
            const emptyRequiredFields = requiredFields.filter(field => !field.value);

            const allRequiredFilled = emptyRequiredFields.length === 0;
            const hasValues = inputValues.some(field => field.value);

            console.log(`🔍 Validation Summary:`);
            console.log(`  Required fields filled: ${allRequiredFilled ? '✅' : '❌'} (${requiredFields.length - emptyRequiredFields.length}/${requiredFields.length})`);
            console.log(`  Has any values: ${hasValues ? '✅' : '❌'}`);
            console.log(`  Overall: ${allRequiredFilled && hasValues ? '✅ READY TO SUBMIT' : '❌ FIX REQUIRED'}`);

            return {
                success: allRequiredFilled && hasValues,
                message: allRequiredFilled && hasValues ? 'Form validation passed - ready to submit' : 'Form validation failed - some required fields are empty',
                allFields: inputValues,
                requiredFields: requiredFields,
                emptyRequiredFields: emptyRequiredFields,
                readyToSubmit: allRequiredFilled && hasValues
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                message: 'Failed to validate form'
            };
        }
    },
});

const smartClick = tool({
    name: 'smart_click',
    description: 'Intelligently click an element using coordinates from AI analysis or fallback to text-based clicking',
    parameters: z.object({
        analysis: z.object({
            elementFound: z.boolean(),
            coordinates: z.object({
                x: z.number(),
                y: z.number()
            }).nullable().optional(),
            textContent: z.string().nullable().optional(),
            cssSelector: z.string().nullable().optional(),
            description: z.string().nullable().optional()
        }).describe('Analysis result from take_screenshot_and_analyze'),
        elementDescription: z.string().describe('Description of what element to click')
    }),
    async execute({ analysis, elementDescription }) {
        try {
            console.log(`🎯 Smart clicking: ${elementDescription}`);

            const browserCheck = checkBrowserAvailable();
            if (browserCheck) return browserCheck;

            // Method 1: Enhanced button identification for Sign in buttons
            if (elementDescription.toLowerCase().includes('sign in') || elementDescription.toLowerCase().includes('signin')) {
                try {
                    console.log(`🔍 Looking for Sign in button with enhanced validation...`);

                    // Get all buttons and analyze them
                    const buttons = await globalPage.$$eval('button', buttons =>
                        buttons.map((btn, index) => {
                            const rect = btn.getBoundingClientRect();
                            const styles = getComputedStyle(btn);
                            return {
                                index: index,
                                text: btn.textContent.trim(),
                                type: btn.type,
                                className: btn.className,
                                id: btn.id,
                                visible: rect.width > 0 && rect.height > 0,
                                backgroundColor: styles.backgroundColor,
                                color: styles.color,
                                position: {
                                    x: Math.round(rect.left + rect.width / 2),
                                    y: Math.round(rect.top + rect.height / 2)
                                }
                            };
                        }).filter(btn => btn.visible)
                    );

                    console.log('📋 Available buttons:');
                    buttons.forEach((btn, i) => {
                        console.log(`  ${i + 1}. "${btn.text}" (type: ${btn.type}, bg: ${btn.backgroundColor})`);
                    });

                    // Find the correct Sign in button (submit type, with "Sign in" text, NOT Google)
                    const signInButton = buttons.find(btn =>
                        btn.text.toLowerCase().includes('sign in') &&
                        btn.type === 'submit' &&
                        !btn.text.toLowerCase().includes('google')
                    );

                    if (signInButton) {
                        console.log(`🎯 Found correct Sign in button: "${signInButton.text}" (type: ${signInButton.type})`);

                        // Click using the most specific selector
                        const buttonLocator = globalPage.locator('button[type="submit"]').filter({ hasText: 'Sign in' });
                        await buttonLocator.click();

                        return {
                            success: true,
                            message: `Successfully clicked correct Sign in button: "${signInButton.text}"`,
                            method: 'enhanced_signin_detection',
                            buttonText: signInButton.text,
                            buttonType: signInButton.type
                        };
                    } else {
                        console.log('⚠️ No correct Sign in button found, trying other methods...');
                    }
                } catch (signInError) {
                    console.log('⚠️ Enhanced Sign in detection failed, trying other methods...');
                }
            }

            // Method 2: Use CSS selector if available (most reliable)
            if (analysis.cssSelector && analysis.cssSelector.trim() !== '') {
                try {
                    console.log(`🎯 Clicking using CSS selector: ${analysis.cssSelector}`);
                    const locator = globalPage.locator(analysis.cssSelector);
                    await locator.waitFor({ state: 'visible', timeout: 5000 });
                    await locator.click();

                    return {
                        success: true,
                        message: `Successfully clicked ${elementDescription} using CSS selector`,
                        method: 'css_selector',
                        selector: analysis.cssSelector
                    };
                } catch (selectorError) {
                    console.log('⚠️ CSS selector click failed, trying text-based click...');
                }
            }

            // Method 3: Use text content if available (very reliable)
            if (analysis.textContent && analysis.textContent.trim() !== '') {
                try {
                    console.log(`📝 Clicking using text content: "${analysis.textContent}"`);
                    const locator = globalPage.getByText(analysis.textContent);
                    await locator.waitFor({ state: 'visible', timeout: 5000 });
                    await locator.click();

                    return {
                        success: true,
                        message: `Successfully clicked ${elementDescription} using text content`,
                        method: 'text_content',
                        textContent: analysis.textContent
                    };
                } catch (textError) {
                    console.log('⚠️ Text-based click failed, trying coordinates...');
                }
            }

            // Method 4: Use coordinates as fallback (less reliable)
            if (analysis.elementFound && analysis.coordinates) {
                try {
                    console.log(`🖱️ Clicking using coordinates (${analysis.coordinates.x}, ${analysis.coordinates.y})`);
                    await globalPage.mouse.click(analysis.coordinates.x, analysis.coordinates.y);

                    return {
                        success: true,
                        message: `Successfully clicked ${elementDescription} using coordinates`,
                        method: 'coordinates',
                        coordinates: analysis.coordinates
                    };
                } catch (coordError) {
                    console.log('⚠️ Coordinate click failed, trying generic search...');
                }
            }

            // Method 5: Generic fallback - search for common button patterns
            const fallbackSelectors = [
                'button',
                'input[type="submit"]',
                'input[type="button"]',
                '[role="button"]',
                'a'
            ];

            for (const selector of fallbackSelectors) {
                try {
                    const elements = await globalPage.$$(selector);
                    for (const element of elements) {
                        const text = await element.textContent();
                        if (text && text.toLowerCase().includes(elementDescription.toLowerCase())) {
                            console.log(`🔄 Fallback click using ${selector}: "${text}"`);
                            await element.click();

                            return {
                                success: true,
                                message: `Successfully clicked ${elementDescription} using fallback method`,
                                method: 'fallback',
                                selector: selector,
                                textContent: text
                            };
                        }
                    }
                } catch (fallbackError) {
                    continue;
                }
            }

            return {
                success: false,
                error: `Could not click ${elementDescription} using any method`,
                message: `Failed to find or click ${elementDescription}. Analysis: ${JSON.stringify(analysis)}`,
                analysis: analysis
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                message: `Failed to click ${elementDescription}`
            };
        }
    },
});

const scrollPage = tool({
    name: 'scroll_page',
    description: 'Scroll the page to make elements visible or scroll to specific positions',
    parameters: z.object({
        direction: z.enum(['down', 'up', 'top', 'bottom']).describe('Direction to scroll'),
        pixels: z.number().nullable().optional().describe('Number of pixels to scroll (default: 500)'),
        elementSelector: z.string().nullable().optional().describe('CSS selector of element to scroll to'),
        scrollToElement: z.boolean().nullable().optional().describe('Whether to scroll to a specific element'),
        method: z.enum(['javascript', 'mouse', 'keyboard']).nullable().optional().describe('Scroll method to use (default: javascript)')
    }),
    async execute({ direction, pixels = 500, elementSelector, scrollToElement, method = 'javascript' }) {
        try {
            console.log(`📜 Scrolling page ${direction} using ${method} method...`);

            const browserCheck = checkBrowserAvailable();
            if (browserCheck) return browserCheck;

            // Get initial scroll position
            const initialScrollPosition = await globalPage.evaluate(() => {
                return window.pageYOffset || document.documentElement.scrollTop;
            });
            console.log(`📍 Initial scroll position: ${initialScrollPosition}`);

            if (scrollToElement && elementSelector) {
                // Scroll to a specific element
                try {
                    console.log(`🎯 Scrolling to element: ${elementSelector}`);
                    await globalPage.locator(elementSelector).scrollIntoViewIfNeeded({ timeout: 5000 });

                    const finalScrollPosition = await globalPage.evaluate(() => {
                        return window.pageYOffset || document.documentElement.scrollTop;
                    });

                    return {
                        success: true,
                        message: `Successfully scrolled to element: ${elementSelector}`,
                        method: 'scroll_to_element',
                        elementSelector: elementSelector,
                        initialPosition: initialScrollPosition,
                        finalPosition: finalScrollPosition
                    };
                } catch (e) {
                    console.log('⚠️ Could not scroll to element, trying general scroll...');
                }
            }

            // Try multiple scroll methods for better reliability
            let scrollSuccess = false;

            if (method === 'mouse') {
                // Use mouse wheel scrolling
                try {
                    console.log(`🖱️ Using mouse wheel to scroll ${direction}`);
                    const viewport = globalPage.viewportSize();
                    const centerX = viewport.width / 2;
                    const centerY = viewport.height / 2;

                    switch (direction) {
                        case 'down':
                            await globalPage.mouse.wheel(0, pixels);
                            break;
                        case 'up':
                            await globalPage.mouse.wheel(0, -pixels);
                            break;
                        case 'top':
                            await globalPage.mouse.wheel(0, -10000); // Large scroll up
                            break;
                        case 'bottom':
                            await globalPage.mouse.wheel(0, 10000); // Large scroll down
                            break;
                    }
                    scrollSuccess = true;
                } catch (e) {
                    console.log('⚠️ Mouse wheel scroll failed, trying keyboard...');
                }
            }

            if (method === 'keyboard' || !scrollSuccess) {
                // Use keyboard scrolling
                try {
                    console.log(`⌨️ Using keyboard to scroll ${direction}`);
                    switch (direction) {
                        case 'down':
                            for (let i = 0; i < Math.ceil(pixels / 100); i++) {
                                await globalPage.keyboard.press('PageDown');
                                await globalPage.waitForTimeout(100);
                            }
                            break;
                        case 'up':
                            for (let i = 0; i < Math.ceil(pixels / 100); i++) {
                                await globalPage.keyboard.press('PageUp');
                                await globalPage.waitForTimeout(100);
                            }
                            break;
                        case 'top':
                            await globalPage.keyboard.press('Home');
                            break;
                        case 'bottom':
                            await globalPage.keyboard.press('End');
                            break;
                    }
                    scrollSuccess = true;
                } catch (e) {
                    console.log('⚠️ Keyboard scroll failed, trying JavaScript...');
                }
            }

            if (method === 'javascript' || !scrollSuccess) {
                // Use JavaScript scrolling (most reliable)
                console.log(`📜 Using JavaScript to scroll ${direction}`);
                switch (direction) {
                    case 'down':
                        await globalPage.evaluate((pixels) => {
                            const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
                            const targetScroll = currentScroll + pixels;
                            window.scrollTo({
                                top: targetScroll,
                                behavior: 'smooth'
                            });
                            console.log(`Scrolled from ${currentScroll} to ${targetScroll}`);
                        }, pixels);
                        break;
                    case 'up':
                        await globalPage.evaluate((pixels) => {
                            const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
                            const targetScroll = Math.max(0, currentScroll - pixels);
                            window.scrollTo({
                                top: targetScroll,
                                behavior: 'smooth'
                            });
                            console.log(`Scrolled from ${currentScroll} to ${targetScroll}`);
                        }, pixels);
                        break;
                    case 'top':
                        await globalPage.evaluate(() => {
                            window.scrollTo({
                                top: 0,
                                behavior: 'smooth'
                            });
                            console.log('Scrolled to top');
                        });
                        break;
                    case 'bottom':
                        await globalPage.evaluate(() => {
                            const maxScroll = Math.max(
                                document.body.scrollHeight,
                                document.documentElement.scrollHeight,
                                document.body.offsetHeight,
                                document.documentElement.offsetHeight,
                                document.body.clientHeight,
                                document.documentElement.clientHeight
                            );
                            window.scrollTo({
                                top: maxScroll,
                                behavior: 'smooth'
                            });
                            console.log(`Scrolled to bottom: ${maxScroll}`);
                        });
                        break;
                }
                scrollSuccess = true;
            }

            // Wait for scroll to complete
            await globalPage.waitForTimeout(1000);

            // Get final scroll position for verification
            const finalScrollPosition = await globalPage.evaluate(() => {
                return window.pageYOffset || document.documentElement.scrollTop;
            });

            const scrollDelta = finalScrollPosition - initialScrollPosition;
            console.log(`📍 Final scroll position: ${finalScrollPosition} (delta: ${scrollDelta})`);

            return {
                success: true,
                message: `Successfully scrolled ${direction} by ${pixels} pixels. Position: ${initialScrollPosition} → ${finalScrollPosition}`,
                method: method,
                direction: direction,
                pixels: pixels,
                initialPosition: initialScrollPosition,
                finalPosition: finalScrollPosition,
                scrollDelta: scrollDelta
            };

        } catch (error) {
            console.error('❌ Scroll error:', error);
            return {
                success: false,
                error: error.message,
                message: `Failed to scroll page ${direction}`
            };
        }
    },
});

export {
    takeScreenshotAndAnalyze,
    openBrowser,
    smartClick,
    fillFieldByDescription,
    validateForm,
    scrollPage,
};