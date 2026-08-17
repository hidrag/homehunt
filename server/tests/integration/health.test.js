import request from 'supertest';
import app from '../../src/app.js';

describe('GET /api/health', () => {
  it('should return 200 and a success message', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.timestamp).toBeDefined();
  });
});
