import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import puppeteer, { Browser } from 'puppeteer';
import { google } from 'googleapis';

import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';

interface DnseResponse {
  s: string; // Status
  c: number[]; // Close prices
  h: number[]; // High prices
  l: number[]; // Low prices
  o: number[]; // Open prices
  t: number[]; // Timestamps
  v: number[]; // Volume
}

@Injectable()
export class TasksService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

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
    try {
      this.logger.log('Fetching E1VFVN30 price via DNSE API...');

      // 1. Generate UNIX timestamps for the last 7 days to today
      const toTime = Math.floor(Date.now() / 1000);
      const fromTime = toTime - 10 * 24 * 60 * 60;

      // 2. Using the DNSE (Entrade) public chart API
      const apiUrl = `https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?resolution=1D&symbol=E1VFVN30&from=${fromTime}&to=${toTime}`;

      const response = await firstValueFrom(
        this.httpService.get<DnseResponse>(apiUrl),
      );
      if (!response) {
        this.logger.error('Failed to crawl E1VFVN30Price, response is empty');
        return;
      }

      if (!response.data) {
        this.logger.error(
          'Failed to crawl E1VFVN30Price, response data is empty',
        );
        return;
      }
      if (!response.data.c || response.data.c.length === 0) {
        this.logger.error(
          'Failed to crawl E1VFVN30Price, no close prices found',
        );
        return;
      }

      const closePrices = response.data.c;

      // Grab the very last closing price in the array (the most current one)
      let rawStockPrice = closePrices[closePrices.length - 1];

      // Safety check: Some APIs return 36 instead of 36000.
      // If it's the smaller format, we multiply by 1000 to match your Google Sheet.
      if (rawStockPrice < 1000) {
        rawStockPrice = Math.round(rawStockPrice * 1000);
      }

      this.logger.log(`Found E1VFVN30 Price: ${rawStockPrice}`);

      // Trigger the sheet update for column F3
      await this.updateE1VFVN30Cell(rawStockPrice);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to crawl E1VFVN30Price: ${error.message}`);
      } else {
        this.logger.error(`Failed to crawl E1VFVN30Price: ${String(error)}`);
      }
    }
  }
}
