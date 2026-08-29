const { buildDispatchRequest, withTargetEnvInput } = require('./githubDispatch');

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

describe('withTargetEnvInput', () => {
  test('adds target_env to existing inputs without mutating the original', () => {
    const inputs = { course_name: '자료구조' };
    const merged = withTargetEnvInput(inputs, 'class-01');

    expect(merged).toEqual({ course_name: '자료구조', target_env: 'class-01' });
    expect(inputs).toEqual({ course_name: '자료구조' });
  });

  test('works with no inputs', () => {
    expect(withTargetEnvInput(null, 'class-02')).toEqual({ target_env: 'class-02' });
  });

  test('throws when targetEnv is missing', () => {
    expect(() => withTargetEnvInput({}, '')).toThrow();
  });
});
