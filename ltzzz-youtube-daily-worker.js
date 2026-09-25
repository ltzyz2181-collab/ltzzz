/**
 * LTZZZ YouTube 每日自动发布流水线
 * 内容主线：观、行深、AI、LTZZZ、AI对人的影响、怜悯之心、失业者新尊严收入
 * 核心理念：让想法进入因果，不是口号，而成为现实
 */

const THEMES = [
  {
    keyword: '观',
    title: '观：看见AI时代被落下的人',
    script: '你有没有看见，楼下修鞋的师傅、超市收银的阿姨，他们正在被时代慢慢抛下？LTZZZ想做的，不是站在山顶讲AI多厉害，而是蹲下来，告诉每一个失去谋生技能的人：你依然有尊严，你依然能靠新的方式站着挣钱。让想法进入因果，不是口号，而是现实。'
  },
  {
    keyword: '行深',
    title: '行深：AI不是来抢你饭碗的',
    script: '很多人怕AI，怕自己的工作被机器抢走。但行深一步看：AI是来帮你把重复的活干了，让你把时间留给真正值钱的事。LTZZZ做的所有工具，都是为了让普通人也能用AI给自己打工，不用看老板脸色，每月多挣一份钱。'
  },
  {
    keyword: 'AI',
    title: 'AI：最公平的时代工具',
    script: '过去开公司要租办公室、雇人、压货，现在一个人加一套AI工具，就能干过去一个团队的活。这是百年不遇的机会，LTZZZ就是把这套工具直接交到你手里，不用你学复杂的代码，拿到就能用，今天开始给自己干。'
  },
  {
    keyword: 'LTZZZ',
    title: 'LTZZZ：让想法变成收入',
    script: '很多人有想法，但不知道怎么变成钱。LTZZZ就是那个把想法变成钱的地方：AI模板、自动化服务、小Agent，你买回去就能用，就能卖，就能开始挣第一份AI时代的钱。我们不喊口号，我们只做能落地、能变现的工具。'
  },
  {
    keyword: 'AI对人的影响',
    title: 'AI对人的影响：不是替代，是解放',
    script: 'AI不会让你失业，只会让你从重复的劳动里解放出来。你不用再花8小时填表格、回消息、做周报，把这些活交给AI，你去做你真正擅长的、能创造价值的事。这才是技术本来该有的样子。'
  },
  {
    keyword: '怜悯之心',
    title: '怜悯之心：不要忘了被落下的人',
    script: '我们做AI工具，不是为了造一个只有精英能玩的圈子。我们记得那些在工厂干了20年突然被优化的工人，记得那些开了半辈子小店现在没生意的老板。LTZZZ的所有产品，都是先想：这个东西，一个40岁的普通人能不能学会，能不能靠它多挣2000块钱。'
  },
  {
    keyword: '失业者新尊严',
    title: '失业者的新尊严：用AI重新站起来',
    script: '失去工作不是你的错，时代变了而已。现在你不用再去挤招聘市场，不用再去求一个岗位。你坐在家里，用我们给你的AI模板、AI工具，就能接单子、做服务、做产品，靠自己的双手重新挣回尊严。这不是梦，这是现在就能开始的事。'
  }
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({
        ok: true,
        service: 'ltzzz-youtube-daily',
        themes: THEMES.length,
        time: new Date().toISOString()
      });
    }

    if (url.pathname === '/run-daily' || url.searchParams.get('cron') === 'true') {
      // 每天自动选一个主题（按日期轮播）
      const dayIndex = Math.floor(Date.now() / 86400000) % THEMES.length;
      const theme = THEMES[dayIndex];
      
      // 生成视频标题和描述
      const title = `【LTZZZ】${theme.title}`;
      const description = `${theme.script}\n\n---\nLTZZZ AI工具，让普通人用AI挣钱：\n网站：https://ltzzz.com\n联系客服：@ltzzz_agi_lab_bot\n#AI #副业 #数字产品 #普通人逆袭`;
      
      // 记录本次发布到KV
      const record = {
        date: new Date().toISOString().slice(0,10),
        theme: theme.keyword,
        title,
        description,
        status: 'ready_to_publish',
        created_at: new Date().toISOString()
      };
      
      await env.KV.put('yt_daily:last', JSON.stringify(record));
      await env.KV.put(`yt_daily:${record.date}`, JSON.stringify(record));
      
      return Response.json({
        ok: true,
        message: '今日内容已生成，等待视频上传',
        ...record
      });
    }

    return Response.json({ error: 'Unknown path' }, { status: 404 });
  }
};
