import axios from 'axios';

const key = 'sk-live-JG1tSNeTWaRlUFvbwt8KfXLR9ixJVWhtJ0OZaSuR';

async function testIndianAPI() {
  const queries = ['Chennai', 'Chennai Petroleum'];
  for (const q of queries) {
    try {
      console.log(`\n--- Querying: "${q}" ---`);
      const res = await axios.get(
        `https://stock.indianapi.in/stock?name=${encodeURIComponent(q)}`,
        {
          headers: {
            'x-api-key': key,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log('Status:', res.status);
      console.log('companyName:', res.data.companyName);
      console.log('currentPrice:', res.data.currentPrice);
      console.log('companyProfile:', JSON.stringify(res.data.companyProfile));
    } catch (err: any) {
      console.error(`Failed for "${q}":`, err.response?.status, err.response?.data || err.message);
    }
  }
}

testIndianAPI();










