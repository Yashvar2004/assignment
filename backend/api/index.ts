export default function handler(req: any, res: any) {
  res.json({
    status: 'ok',
    message: 'Backend is working',
    timestamp: new Date().toISOString(),
  });
}
