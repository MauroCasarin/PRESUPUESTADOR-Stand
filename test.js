import fetch from 'node-fetch';
import * as XLSX from 'xlsx';

const BASE_PRICES = {
  "4": 2950000,
  "6": 3191500,
  "8": 3430000,
  "10": 3673500,
  "12": 4000000,
  "15": 4500000
};

async function test() {
  const targetUrl = 'http://www.marcelomagni.com.ar/Terminar-2026.xlsx';
  
  try {
    const res = await fetch('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(targetUrl));
    const buf = await res.arrayBuffer();
    
    const workbook = XLSX.read(buf, { type: 'array' });
    for (const sheetName of workbook.SheetNames) {
      console.log('Sheet:', sheetName);
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      for (const row of data) {
        const congreso = row['Congreso'] || row['CONGRESO'] || row['congreso'] || '';
        const pValue = row['P'] || row['p'] || row['Presupuesto'] || 0;
        if (congreso) {
          console.log(`  Congreso: ${congreso} | P: ${pValue}`);
        }
      }
    }
  } catch(e) {
    console.log('error', e);
  }
}

test();
