import fetch from 'node-fetch';

async function test() {
  const targetUrl = 'http://www.marcelomagni.com.ar/Terminar-2026.xlsx';
  
  try {
    const res = await fetch('https://corsproxy.org/api?url=' + encodeURIComponent(targetUrl));
    console.log('corsproxy.org status:', res.status);
    const buf = await res.arrayBuffer();
    console.log('corsproxy.org size:', buf.byteLength);
  } catch(e) {
    console.log('corsproxy.org error', e);
  }
}

test();
