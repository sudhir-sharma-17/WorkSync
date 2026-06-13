import asyncio
from playwright.async_api import async_playwright

url = 'https://docs.google.com/forms/d/e/1FAIpQLSeojSdS8Y4AKVsfmBy06nXpOdQZBGUypKmzsz-sRokzadktoQ/viewform?usp=publish-editor'

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(url, wait_until='networkidle')
        
        container = page.locator('.Qr7Oae').filter(has_text='date').first
        inputs = container.locator('input[type="text"]')
        
        print("Input count:", await inputs.count())
        
        # Fill first with 01, second with 03
        await inputs.nth(0).fill("01")
        await inputs.nth(1).fill("03")
        
        print("Filled successfully!")
        await browser.close()

asyncio.run(run())
