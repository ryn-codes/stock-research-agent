import axios from 'axios';

export interface ScreenerData {
  ticker: string;
  url: string;
  ratiosHtml: string;
  prosHtml: string;
  consHtml: string;
  peersHtml: string;
  quartersHtml: string;
  profitLossHtml: string;
  balanceSheetHtml: string;
  cashFlowHtml: string;
  shareholdingHtml: string;
  rawText?: string;
}

export class ScreenerTool {
  /**
   * Fetches public stock financial data from Screener.in for a given ticker.
   */
  static async getCompanyData(ticker: string): Promise<ScreenerData | null> {
    const cleanTicker = ticker.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!cleanTicker) return null;

    const url = `https://www.screener.in/company/${cleanTicker}/`;
    console.log(`[ScreenerTool] Fetching: ${url}`);

    try {
      const response = await axios.get<string>(url, {
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (response.status !== 200 || !response.data) {
        console.warn(`[ScreenerTool] Failed to load Screener page for ${cleanTicker}: Status ${response.status}`);
        return null;
      }

      const html = response.data;

      // Extract sections
      const ratiosHtml = this.extractHtmlSectionByTag(html, 'id="top-ratios"', 'ul');
      const prosHtml = this.extractHtmlSectionByClass(html, 'pros');
      const consHtml = this.extractHtmlSectionByClass(html, 'cons');
      const quartersHtml = this.extractHtmlSectionById(html, 'quarters');
      const profitLossHtml = this.extractHtmlSectionById(html, 'profit-loss');
      const balanceSheetHtml = this.extractHtmlSectionById(html, 'balance-sheet');
      const cashFlowHtml = this.extractHtmlSectionById(html, 'cash-flow');
      const shareholdingHtml = this.extractHtmlSectionById(html, 'shareholding');

      // Extract company ID and load dynamic peers table if available
      let peersHtml = '';
      const companyIdMatch = html.match(/data-company-id="(\d+)"/);
      if (companyIdMatch) {
        const companyId = companyIdMatch[1];
        const peersUrl = `https://www.screener.in/api/company/${companyId}/peers/`;
        console.log(`[ScreenerTool] Fetching dynamic peers table: ${peersUrl}`);
        try {
          const peersResponse = await axios.get<string>(peersUrl, {
            timeout: 10000,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            },
          });
          if (peersResponse.status === 200 && peersResponse.data) {
            peersHtml = peersResponse.data;
          }
        } catch (err: any) {
          console.warn(`[ScreenerTool] Failed to fetch dynamic peers table for ${cleanTicker}:`, err.message);
        }
      }

      if (!peersHtml) {
        peersHtml = this.extractHtmlSectionById(html, 'peers');
      }

      // Compile a condensed raw text copy of key stats for fallback
      const cleanText = (raw: string) =>
        raw
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const summaryStats = cleanText(ratiosHtml);

      return {
        ticker: cleanTicker,
        url,
        ratiosHtml,
        prosHtml,
        consHtml,
        peersHtml,
        quartersHtml,
        profitLossHtml,
        balanceSheetHtml,
        cashFlowHtml,
        shareholdingHtml,
        rawText: `Screener.in Ratios for ${cleanTicker}: ${summaryStats}`,
      };
    } catch (err: any) {
      console.error(`[ScreenerTool] Error fetching Screener data for ${cleanTicker}:`, err.message || err);
      return null;
    }
  }

  /**
   * Helper to parse peer details from Screener's peers table HTML fragment.
   */
  static parsePeers(peersHtml: string): { name: string; ticker: string; marketCap: number; pe: number | null }[] {
    const peers: { name: string; ticker: string; marketCap: number; pe: number | null }[] = [];
    if (!peersHtml) return peers;

    const tbodyStart = peersHtml.indexOf('<tbody>');
    const tbodyEnd = peersHtml.indexOf('</tbody>');
    if (tbodyStart === -1 || tbodyEnd === -1) return peers;

    const tbodyContent = peersHtml.substring(tbodyStart + 7, tbodyEnd);

    // Split by <tr>
    const rows = tbodyContent.split(/<tr[^>]*>/);
    for (const row of rows) {
      if (!row.includes('</tr>')) continue;

      const linkMatch = row.match(/<a\s+href="\/company\/([A-Z0-9_-]+)\/(?:consolidated\/)?"[^>]*>\s*([^<]+)\s*<\/a>/);
      if (!linkMatch) continue;

      const ticker = linkMatch[1];
      const name = linkMatch[2].trim();

      const tdTexts = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
        m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      );
      if (tdTexts.length < 5) continue;

      // columns: S.No, Name, CMP, P/E, Mar Cap
      const peStr = tdTexts[3].replace(/,/g, '');
      const peVal = peStr ? parseFloat(peStr) : null;
      const mcapVal = parseFloat(tdTexts[4].replace(/,/g, '')) || 0;

      peers.push({
        name,
        ticker,
        marketCap: mcapVal,
        pe: peVal && !isNaN(peVal) ? peVal : null,
      });
    }

    return peers;
  }

  private static extractHtmlSectionById(html: string, sectionId: string): string {
    const startIdx = html.indexOf(`id="${sectionId}"`);
    if (startIdx === -1) return '';

    const nextSectionIdx = html.indexOf('<section id="', startIdx + 15);
    const endIdx = nextSectionIdx !== -1 ? nextSectionIdx : html.indexOf('</main>', startIdx);

    if (endIdx !== -1) {
      return html.substring(startIdx - 20, endIdx);
    }
    return html.substring(startIdx - 20, startIdx + 8000);
  }

  private static extractHtmlSectionByClass(html: string, className: string): string {
    const startIdx = html.indexOf(`class="${className}"`);
    if (startIdx === -1) return '';

    const endTag = '</div>';
    const endIdx = html.indexOf(endTag, startIdx);
    if (endIdx !== -1) {
      return html.substring(startIdx - 10, endIdx + endTag.length);
    }
    return html.substring(startIdx - 10, startIdx + 2000);
  }

  private static extractHtmlSectionByTag(html: string, identifier: string, tagName: string): string {
    const startIdx = html.indexOf(identifier);
    if (startIdx === -1) return '';

    const endTag = `</${tagName}>`;
    const endIdx = html.indexOf(endTag, startIdx);
    if (endIdx !== -1) {
      return html.substring(startIdx - 10, endIdx + endTag.length);
    }
    return html.substring(startIdx - 10, startIdx + 4000);
  }
}
