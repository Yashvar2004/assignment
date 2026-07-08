export default function handler(req: any, res: any) {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL ? 'set' : 'not set',
      HUBSPOT_PAT_TOKEN: process.env.HUBSPOT_PAT_TOKEN ? 'set' : 'not set',
    },
  });
}
