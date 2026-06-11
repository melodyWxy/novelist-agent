'use client';

import { useState } from 'react';

const guideSteps = [
  {
    title: '1. 新建作品',
    text: '填写书名、题材、主角、文风和世界观。文风快捷选项可组合使用，例如“偏诙谐、轻松吐槽、节奏明快”。',
    art: ['书名', '主角', '文风'],
  },
  {
    title: '2. 生成叙事宇宙',
    text: '进入作品详情后点击“生成叙事宇宙”，系统会生成世界 Bible、世界线、配角隐线和主角行动线。',
    art: ['世界线', '配角隐线', '主角线'],
  },
  {
    title: '3. 发现碰撞',
    text: '碰撞是“世界正在发生的事”与“主角行动”撞在一起的剧情机会。默认每轮生成 6 个候选，可在界面调整。',
    art: ['世界事件', '碰撞', '主角行动'],
  },
  {
    title: '4. 生成故事包',
    text: '从碰撞候选中生成章节事件包。故事包会包含场景节拍、隐线暗示、主角收益和世界状态变化。',
    art: ['碰撞候选', '故事包', '章节结构'],
  },
  {
    title: '5. 写出章节',
    text: '点击“写出章节”或“一键产出章节”。系统会写正文、检查隐线泄露、审稿，不通过时自动修订。',
    art: ['正文', '审稿', '修订'],
  },
  {
    title: '6. 持续自动产出',
    text: '点击“启动持续自动产出”，worker 会按 cron 循环执行：推进时间线 -> 选碰撞 -> 生成故事包 -> 写章节。',
    art: ['Tick', '事件包', '章节'],
  },
];

export function HelpButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn btn-secondary help-trigger" onClick={() => setOpen(true)}>
        使用文档
      </button>

      {open && (
        <div className="help-overlay" role="dialog" aria-modal="true" aria-labelledby="help-title">
          <div className="help-modal">
            <div className="help-head">
              <div>
                <p className="muted">图文教学</p>
                <h2 id="help-title">从 0 到自动连载</h2>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setOpen(false)}
              >
                关闭
              </button>
            </div>

            <div className="help-hero">
              <div className="help-flow">
                <span>作品</span>
                <b />
                <span>宇宙</span>
                <b />
                <span>碰撞</span>
                <b />
                <span>章节</span>
              </div>
              <p>
                推荐路径：先生成叙事宇宙，再用“一键产出章节”验证质量；稳定后开启“持续自动产出”。
              </p>
            </div>

            <div className="help-grid">
              {guideSteps.map((step) => (
                <section key={step.title} className="help-step">
                  <div className="help-illustration" aria-hidden="true">
                    {step.art.map((item, index) => (
                      <span key={item} className={index === 1 ? 'help-node help-node-hot' : 'help-node'}>
                        {item}
                      </span>
                    ))}
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </section>
              ))}
            </div>

            <div className="help-note">
              <strong>运行提醒：</strong>
              本地开发用 <code>npm run dev:all</code>；Docker 部署时需要同时运行 <code>web</code> 和{' '}
              <code>worker</code>，否则定时任务不会执行。
            </div>
          </div>
        </div>
      )}
    </>
  );
}
