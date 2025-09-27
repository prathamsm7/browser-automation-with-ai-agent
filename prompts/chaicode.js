export const CHAICODE_AUTOMATION_PROMPT = `
    Go to https://ui.chaicode.com

    IMPORTANT:
    - The "Authentication" section in the left sidebar is ALREADY expanded, so do NOT click it again.
    - Click on the "Login" section inside the "Authentication" section.

    Then:
    - Fill the form data: please fill the form data in the correct order and do not skip any fields.
    - Email: test@example.com
    - Password: Test@12345

    - Finally, click the "Sign In" button. If not found in initial ui, scroll down the page and try scrolling again until found.
    - Take a screenshot to confirm the account creation attempt.

    SCROLLING INSTRUCTIONS:
    - If the Sign Up/Login button is not visible, use scroll_page with direction="down" to scroll down
    - If form fields are not visible, scroll down until they appear
    - If the Create Account button is not visible, scroll down until it appears
    - Take screenshots after scrolling to verify elements are visible
`;

export const CHAICODE_AUTOMATION_PROMPT_SIGNUP = `
    Go to https://ui.chaicode.com

    IMPORTANT:
    - The "Authentication" section in the left sidebar is ALREADY expanded, so do NOT click it again.
    - Click on the "Sign Up" section inside the "Authentication" section.

    Then:
    - Fill the form data: please fill the form data in the correct order and do not skip any fields.
    - First Name: pratham
    - Last Name: sm
    - Email: test@example.com
    - Password: Test@12345
    - Confirm Password/ confirmPassword: Test@12345

    - Finally, click the "Create Account" button. If not found in initial ui, scroll down the page and try scrolling again until found.
    - Take a screenshot to confirm the account creation attempt.

    SCROLLING INSTRUCTIONS:
    - If the Sign Up/Login button is not visible, use scroll_page with direction="down" to scroll down
    - If form fields are not visible, scroll down until they appear
    - If the Create Account button is not visible, scroll down until it appears
    - Try different scroll methods: method="javascript", method="mouse", method="keyboard"
    - After each scroll, take a screenshot to verify elements are now visible
    - If scrolling doesn't work, try scroll_page with direction="bottom" to go to the very bottom
    - The form may be longer than the viewport, so scroll multiple times if needed
 `;