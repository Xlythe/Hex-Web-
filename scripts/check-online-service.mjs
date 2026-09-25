const baseUrl = (process.env.VITE_IGGC_API_BASE_URL ||
  'https://hex-api.xlythe.com').replace(/\/+$/, '');

const body = new URLSearchParams({
  app_id: '17',
  app_code: 'wihamo8984',
  login: 'hex_nonexistent_health_probe',
  password: '00000000000000000000000000000000',
  md5: '1',
  networkuid: 'hex-health-probe',
});

try {
  const response = await fetch(`${baseUrl}/api_login.php`, {
    method: 'POST',
    headers: {
      Accept: 'application/xml, text/xml',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok || !/<(?:errorMessage|loginResult)\b/i.test(text)) {
    throw new Error(`login API returned HTTP ${response.status} or an unexpected response`);
  }
  console.log('Hex online API responded with XML.');
} catch (error) {
  console.error(`Hex online API smoke check failed: ${error.message}`);
  process.exitCode = 1;
}
