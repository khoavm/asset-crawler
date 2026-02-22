import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import puppeteer, { Browser } from 'puppeteer';
import { google } from 'googleapis';

import { ConfigService } from '@nestjs/config';
@Injectable()
export class TasksService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TasksService.name);

  constructor(private readonly configService: ConfigService) {}

  async onApplicationBootstrap() {
    this.logger.log(
      'Application started. Running initial crawlers sequentially...',
    );

    // Await them so they don't fight for system resources on startup
    await this.crawlDojiHungThinhVuong9999GoldRingPrice();
    await this.crawlE1VFVN30Price();

    this.logger.log(
      'Initial crawl complete. Cron schedules will now take over.',
    );
  }

  private async updateSheetCell(sheet: string, cell: string, value: string) {
    try {
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      const sheets = google.sheets({ version: 'v4', auth });
      const spreadsheetId = this.configService.get<string>('SPREADSHEET_ID');

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheet}!${cell}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[value]],
        },
      });

      this.logger.log(`Successfully updated cell ${cell} with value: ${value}`);
    } catch (error) {
      this.logger.error(
        `updateSheetCell Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  // --- NEW: Helper method to update the Google Sheet ---
  private async updateGoldCell(buyPrice: string) {
    try {
      await this.updateSheetCell('Trang tính1', 'F2', buyPrice);
      this.logger.log(`Successfully updateGoldCell price: ${buyPrice}`);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`updateGoldCell Error: ${error.message}`);
      } else {
        this.logger.error(`updateGoldCell Error: ${String(error)}`);
      }
    }
  }

  private async updateE1VFVN30Cell(stockPrice: number) {
    try {
      await this.updateSheetCell('Trang tính1', 'F3', stockPrice.toString());
      this.logger.log(`Successfully updateE1VFVN30Cell price: ${stockPrice}`);
    } catch (error) {
      this.logger.error(
        `updateE1VFVN30Cell Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_12_HOURS)
  async crawlDojiHungThinhVuong9999GoldRingPrice() {
    let browser: Browser | null = null;
    try {
      this.logger.log('Launching crawler for DOJI...');

      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      await page.goto('https://trangsuc.doji.vn/pages/bang-gia-vang', {
        waitUntil: 'domcontentloaded', // Stop waiting for heavy ads/images
        timeout: 60000,
      });

      await page.waitForSelector('table', { timeout: 10000 });

      const goldData = await page.evaluate(() => {
        const rows = document.querySelectorAll('tr');
        let buyPrice: string | null = null;

        for (const row of Array.from(rows)) {
          const text = row.innerText;

          if (
            text.includes('Hưng Thịnh Vượng') ||
            text.includes('Nhẫn Tròn 9999')
          ) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
              // We only extract the Buy price based on your request
              buyPrice = cells[1].innerText.trim();
              break;
            }
          }
        }

        return { buyPrice };
      });

      if (goldData.buyPrice) {
        this.logger.log(`Found Buy Price: ${goldData.buyPrice}`);

        // --- NEW: Trigger the sheet update ---
        await this.updateGoldCell(goldData.buyPrice);
      } else {
        this.logger.warn(
          'Could not locate the Hưng Thịnh Vượng row on the page.',
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to crawl DOJI: ${error.message}`);
      } else {
        this.logger.error(`Failed to crawl DOJI: ${String(error)}`);
      }
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  @Cron(CronExpression.EVERY_12_HOURS)
  async crawlE1VFVN30Price() {
    let browser: Browser | null = null;
    try {
      this.logger.log('Launching crawler for Vietstock (E1VFVN30)...');

      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      // Navigate to the Vietstock ETF page
      await page.goto(
        'https://finance.vietstock.vn/E1VFVN30-quy-etf-dcvfmvn30.htm',
        {
          waitUntil: 'domcontentloaded', // Stop waiting for heavy ads/images
          timeout: 60000,
        },
      );

      // Wait for the main stock info section to load
      await page.waitForSelector('#stockprice span.price', { timeout: 15000 });

      const stockData = await page.evaluate(() => {
        // Target the exact ID and class from your screenshot
        const priceElement = document.querySelector(
          '#stockprice span.price',
        ) as HTMLElement;
        let currentPriceString: string | null = null;

        if (priceElement) {
          // This will grab exactly "36,000" and ignore the arrow icon next to it
          currentPriceString = priceElement.innerText.trim();
        }

        return { currentPriceString };
      });

      if (stockData.currentPriceString) {
        // CLEANUP: Remove commas/dots so "36,000" becomes 36000
        const rawStockPrice = parseInt(
          stockData.currentPriceString.replace(/\D/g, ''),
          10,
        );

        this.logger.log(`Found E1VFVN30 Price: ${rawStockPrice}`);

        // Trigger the sheet update for column G
        await this.updateE1VFVN30Cell(rawStockPrice);
      } else {
        this.logger.warn('Could not locate the ETF price on Vietstock.');
      }
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to crawl Vietstock: ${error.message}`);
      } else {
        this.logger.error(`Failed to crawl Vietstock: ${String(error)}`);
      }
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}
