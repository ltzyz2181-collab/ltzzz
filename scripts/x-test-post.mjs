const token = process.env.X_USER_ACCESS_TOKEN;
if (!token) throw new Error('Missing X_USER_ACCESS_TOKEN');

const text = process.env.X_TEST_TEXT || 'LTZZZ 测试动态：观，行深。今天开始让 AI、代码、记忆与真实结果一起长期演化。';

const res = await fetch('https://api.x.com/2/tweets', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ text }),
});

const body = await res.text();
if (!res.ok) throw new Error(`X API ${res.status}: ${body}`);
console.log(body);
