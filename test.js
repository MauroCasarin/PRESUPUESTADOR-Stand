import fetch from 'node-fetch';
fetch('https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVARNAL_D_T_22&limit=1&sort=desc')
  .then(res => res.text())
  .then(text => console.log(text))
  .catch(err => console.error(err));
