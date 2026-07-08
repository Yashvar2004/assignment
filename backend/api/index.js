module.exports = (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Backend is working',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL ? 'set' : 'not set',
      HUBSPOT_PAT_TOKEN: process.env.HUBSPOT_PAT_TOKEN ? 'set' : 'not set',
    },
  });
};
