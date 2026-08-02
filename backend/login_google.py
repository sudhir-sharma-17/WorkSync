import asyncio
import os
import sys
from playwright.async_api import async_playwright

async def main():
    print("=================================================================")
    print("      WorkSync: Google Account Login Utility for Playwright     ")
    print("=================================================================")
    print("\nLaunching browser in visible mode...")
    print("Instructions:")
    print("1. Log in to the Google Account that has permission to access your forms.")
    print("2. Once successfully logged in, close the browser window.")
    print("-----------------------------------------------------------------\n")

    # Ensure user data dir exists
    user_data_dir = os.path.abspath("playwright_user_data")
    
    async with async_playwright() as p:
        try:
            context = await p.chromium.launch_persistent_context(
                user_data_dir=user_data_dir,
                headless=False,  # Show the browser
                args=["--disable-blink-features=AutomationControlled"],
            )
            page = await context.new_page()
            await page.goto("https://accounts.google.com")
            
            # Wait until all pages are closed by the user
            while True:
                await asyncio.sleep(1)
                if not context.pages:
                    break
        except Exception as e:
            print(f"\nError: {e}")
            return

    print("\n-----------------------------------------------------------------")
    print("Google Account session saved successfully!")
    print("You can now run WorkSync automated submissions in headless mode.")
    print("=================================================================")

if __name__ == "__main__":
    asyncio.run(main())
