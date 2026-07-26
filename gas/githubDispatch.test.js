const { buildDispatchRequest } = require('./githubDispatch');

describe('buildDispatchRequest', () => {
  test('builds the dispatches URL and JSON payload', () => {
    const request = buildDispatchRequest(
      'wawworld72',
      'test',
      'attendance-scrape.yml',
      'main',
      { report_url: 'https://example.com' },
      'ghp_secret'
    );

    expect(request.url).toBe(
      'https://api.github.com/repos/wawworld72/test/actions/workflows/attendance-scrape.yml/dispatches'
    );
    expect(request.options.method).toBe('post');
    expect(request.options.headers.Authorization).toBe('Bearer ghp_secret');
    expect(JSON.parse(request.options.payload)).toEqual({
      ref: 'main',
      inputs: { report_url: 'https://example.com' },
    });
  });

  test('defaults inputs to an empty object', () => {
    const request = buildDispatchRequest('o', 'r', 'wf.yml', 'main', null, 't');
    expect(JSON.parse(request.options.payload)).toEqual({ ref: 'main', inputs: {} });
  });

  test('throws when a required argument is missing', () => {
    expect(() => buildDispatchRequest('o', 'r', 'wf.yml', 'main', {}, '')).toThrow();
  });
});
