import "dotenv/config";

export const PIYUSHGARG_AUTOMATION_PROMPT = `
    Go to https://www.piyushgarg.dev/guest-book 
    
    STEP 1: Find and click the "Sign in with Github" button
    - Look for a button that says "Sign in with Github" or similar text
    - Click on this button to proceed to GitHub login
    
    STEP 2: Fill in the GitHub login credentials (BOTH fields must be filled)
    - FIRST: Fill the "Username or email address" field with: ${process.env.GIT_USERNAME}
    - SECOND: Fill the "Password" field with: ${process.env.GIT_PASSWORD}
    - IMPORTANT: Fill BOTH fields completely before proceeding
    - Use validate_login_form tool to verify both fields are filled correctly:
        - Username or email address: "${process.env.GIT_USERNAME}"
        - Password: "${process.env.GIT_PASSWORD}"
    
    STEP 3: Click the correct Sign In button exactly below password field
    - Look for the GREEN "Sign in" button (not the white "Continue with Google" button)
    - The green button should be labeled "Sign in" and be green in color
    - DO NOT click "Continue with Google" or any other button
    - ONLY click the green "Sign in" button
    
    STEP 4: Handle 2FA if prompted
    - If prompted for 2FA (two-factor authentication), wait for the user to complete it manually
    - Do not attempt to fill any 2FA fields automatically
    
    STEP 5: Report status
    - Once login process is initiated, report back about the current status
    - DO NOT attempt to fill guest book message yet - just complete the login process
    
    CRITICAL INSTRUCTIONS:
    - Fill BOTH username/email AND password fields using fill_field_by_description
    - Use validate_login_form tool to verify both fields are filled correctly before proceeding
    - Click ONLY the green "Sign in" button, NOT "Continue with Google"
    - Take screenshots after each major step to verify progress
    - Use take_screenshot_and_analyze to find elements before interacting with them
    - The enhanced fillFieldByDescription function now includes retry logic and validation
    - The enhanced smartClick function now has special handling for Sign in buttons
`;