import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from app.db.models import UploadBatch
from app.automation.submission_engine import detect_field_map
from playwright.async_api import async_playwright

async def run():
    engine = create_async_engine("sqlite+aiosqlite:///app.db")
    async_session = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with async_session() as session:
        result = await session.execute(select(UploadBatch.form_url).limit(1))
        url = result.scalar()
    
    if not url:
        print("No URL found in DB")
        return
        
    print(f"Testing URL: {url}")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        field_map, found, missing = await detect_field_map(page, url)
        print("FIELD MAP:", field_map)
        print("MISSING:", missing)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
