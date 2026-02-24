import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import puppeteer, { Browser } from 'puppeteer';
import { google } from 'googleapis';

import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { browser } from 'globals';
import replaceProperty = jest.replaceProperty;

interface DnseResponse {
  s: string; // Status
  c: number[]; // Close prices
  h: number[]; // High prices
  l: number[]; // Low prices
  o: number[]; // Open prices
  t: number[]; // Timestamps
  v: number[]; // Volume
}

interface BinanceResponse {
  symbol: string;
  price: string;
}

@Injectable()
export class TasksService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TasksService.name);
  private browser: Browser | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}
  async onModuleDestroy() {
    await this.browser?.close();
  }

  async onApplicationBootstrap() {
    this.logger.log(
      'Application started. Running initial crawlers sequentially...',
    );

    // Await them so they don't fight for system resources on startup

    await this.crawlDojiHungThinhVuong9999GoldRingPrice();
    await this.crawlE1VFVN30Price();
    await this.crawlBinancePrice();

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
          values: [[value.replaceAll('.', ',').trim()]],
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
  private async updateGoldCell(buyPrice: string | number) {
    try {
      await this.updateSheetCell('Detail', 'E2', buyPrice.toString());
      this.logger.log(`Successfully updateGoldCell price: ${buyPrice}`);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`updateGoldCell Error: ${error.message}`);
      } else {
        this.logger.error(`updateGoldCell Error: ${String(error)}`);
      }
    }
  }

  private async updateE1VFVN30Cell(stockPrice: number | string) {
    try {
      await this.updateSheetCell('Detail', 'E18', stockPrice.toString());
      this.logger.log(`Successfully update E1VFVN30Cell price: ${stockPrice}`);
    } catch (error) {
      this.logger.error(
        `updateE1VFVN30Cell Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async updateUSDTCell(price: number | string) {
    try {
      await this.updateSheetCell('Detail', 'C9', price.toString());
      this.logger.log(`Successfully update USDTCell price: ${price}`);
    } catch (error) {
      this.logger.error(
        `updateUSDTCell Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async updatePaxGoldCell(stockPrice: number | string) {
    try {
      await this.updateSheetCell('Detail', 'C10', stockPrice.toString());
      this.logger.log(`Successfully update PAXGCell price: ${stockPrice}`);
    } catch (error) {
      this.logger.error(
        `updatePaxGoldCell Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async updateBTCCell(stockPrice: number | string) {
    try {
      await this.updateSheetCell('Detail', 'C11', stockPrice.toString());
      this.logger.log(`Successfully update BTCCell price: ${stockPrice}`);
    } catch (error) {
      this.logger.error(
        `updateBTCCell Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async getBrowser(): Promise<Browser> {
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
      return this.browser;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to getBrowser: ${error.message}`);
      } else {
        this.logger.error(`Failed to getBrowser: ${String(error)}`);
      }
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_3_HOURS)
  async crawlDojiHungThinhVuong9999GoldRingPrice() {
    let browser: Browser | null = null;
    try {
      const start = process.hrtime.bigint();
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
        goldData.buyPrice = goldData.buyPrice
          .replace(/,/g, '')
          .replaceAll('.', '');
        this.logger.log(`Found Buy Price: ${goldData.buyPrice}`);

        // --- NEW: Trigger the sheet update ---
        await this.updateGoldCell(goldData.buyPrice);
      } else {
        this.logger.warn(
          'Could not locate the Hưng Thịnh Vượng row on the page.',
        );
      }
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;
      this.logger.log(
        `Crawl Doji Hung Thinh Vuong 9999 Gold Ring Price took ${durationMs.toFixed(2)}ms`,
      );
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

  @Cron(CronExpression.EVERY_DAY_AT_4PM)
  async crawlE1VFVN30Price() {
    try {
      const start = process.hrtime.bigint();
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
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;
      this.logger.log(`Crawl E1VFVN30 Price took ${durationMs.toFixed(2)}ms`);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to crawl E1VFVN30Price: ${error.message}`);
      } else {
        this.logger.error(`Failed to crawl E1VFVN30Price: ${String(error)}`);
      }
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async crawlBinancePrice() {
    try {
      const usdtToVndPrice = await this.crawlUSDTPrice();
      if (!usdtToVndPrice) {
        this.logger.error(
          'Could not crawl USDT price because VND price is undefined, skipping Binance crawl.',
        );
        return;
      }
      await this.crawlPAXGPrice(usdtToVndPrice);
      await this.crawlBTCPrice(usdtToVndPrice);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to crawl Binance: ${error.message}`);
      } else {
        this.logger.error(`Failed to crawl Binance: ${String(error)}`);
      }
    }
  }

  async crawlPAXGPrice(vndPrice: number) {
    try {
      const start = process.hrtime.bigint();
      this.logger.log('Launching crawler for Binance PAXG...');
      const apiUrl = `https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT`;

      const response = await firstValueFrom(
        this.httpService.get<BinanceResponse>(apiUrl),
      );
      if (!response) {
        this.logger.error('Failed to crawl Binance PAXG, response is empty');
        return;
      }

      if (!response.data) {
        this.logger.error(
          'Failed to crawl Binance PAXG, response data is empty',
        );
        return;
      }

      const priceText = Number(response.data.price) * vndPrice;
      if (priceText) {
        this.logger.log(`Found PAXG Price : ${priceText}`);

        await this.updatePaxGoldCell(priceText);
      } else {
        this.logger.warn('Could not locate PAXG price on the page.');
      }
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;
      this.logger.log(`Crawl PAXG Price took ${durationMs.toFixed(2)}ms`);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to crawl PAXG: ${error.message}`);
      } else {
        this.logger.error(`Failed to crawl PAXG: ${String(error)}`);
      }
    }
  }

  async crawlUSDTPrice() {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      const start = process.hrtime.bigint();
      this.logger.log('Launching crawler for Binance USDT...');

      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      );

      await page.goto('https://www.binance.com/vi/price/tether/VND', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll('span')).some((el) =>
          el.innerText.includes('VND'),
        );
      });
      const priceText = await page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('span'));

        // Example text: "₫25,990.10 VND"
        const priceSpan = spans.find(
          (el) => /VND/.test(el.innerText) && /₫/.test(el.innerText),
        );

        if (!priceSpan) return null;

        // Extract number
        return Number(
          priceSpan.innerText
            .replace(/[₫,]/g, '')
            .replace('VND', '')
            .trim()
            .split('=')[1]
            .trim(),
        );
      });

      if (priceText) {
        this.logger.log(`Found USDT Price: ${priceText}`);

        await this.updateUSDTCell(priceText);
      } else {
        this.logger.warn('Could not locate USDT price on the page.');
      }
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;
      this.logger.log(`Crawl USDT Price took ${durationMs.toFixed(2)}ms`);
      return priceText;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to crawl USDT: ${error.message}`);
      } else {
        this.logger.error(`Failed to crawl USDT: ${String(error)}`);
      }
    } finally {
      await page?.close();
      await browser?.close();
    }
  }

  async crawlBTCPrice(vndPrice: number) {
    try {
      const start = process.hrtime.bigint();
      this.logger.log('Launching crawler for Binance BTC...');
      const apiUrl = `https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT`;

      const response = await firstValueFrom(
        this.httpService.get<BinanceResponse>(apiUrl),
      );
      if (!response) {
        this.logger.error('Failed to crawl Binance BTC, response is empty');
        return;
      }

      if (!response.data) {
        this.logger.error(
          'Failed to crawl Binance BTC, response data is empty',
        );
        return;
      }

      const priceText = Number(response.data.price) * vndPrice;

      if (priceText) {
        this.logger.log(`Found BTC Price : ${priceText}`);

        await this.updateBTCCell(priceText);
      } else {
        this.logger.warn('Could not locate BTC price on the page.');
      }
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;
      this.logger.log(`Crawl BTC Price took ${durationMs.toFixed(2)}ms`);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to crawl BTC: ${error.message}`);
      } else {
        this.logger.error(`Failed to crawl BTC: ${String(error)}`);
      }
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkHealth() {
    try {
      this.logger.log('Checking health...');
      const response = await firstValueFrom(
        this.httpService.get<string>('https://asset-crawler.onrender.com/ping'),
      );
      if (!response) {
        throw new Error('response is empty');
      }
      if (!response.data) {
        throw new Error('response data is empty');
      }
      this.logger.log(`Health check successful. Response: ${response.data}`);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to check health: ${error.message}`);
      } else {
        this.logger.error(`Failed to check health: ${String(error)}`);
      }
    }
  }
}
