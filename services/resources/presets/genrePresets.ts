/**
 * 网文题材预设数据库
 */

import { GenrePreset } from './presetTypes';
import {
  XUANHUAN_TEMPLATES,
  URBAN_TEMPLATES,
  SYSTEM_TEMPLATES,
  PALACE_TEMPLATES,
  MYSTERY_TEMPLATES,
  ROMANCE_TEMPLATES,
  SCIFI_TEMPLATES,
  WUXIA_TEMPLATES,
  GAME_TEMPLATES,
  HISTORY_TEMPLATES,
  INFINITE_TEMPLATES,
  HONGHUANG_TEMPLATES,
  GAME_LIT_TEMPLATES,
  LIVESTREAM_TEMPLATES,
  COSMIC_HORROR_TEMPLATES,
  HISTORY_TRAVEL_TEMPLATES
} from './presetTemplates';
import {
  XUANHUAN_SKILL_CHARACTER_DESIGNER,
  XUANHUAN_SKILL_EXPECTATION_MANAGER,
  XUANHUAN_SKILL_PLEASURE_RHYTHM,
  XUANHUAN_SKILL_WORLD_BUILDER,
  URBAN_SKILL_CHARACTER_DESIGNER,
  URBAN_SKILL_EXPECTATION_MANAGER,
  URBAN_SKILL_PLEASURE_RHYTHM,
  URBAN_SKILL_WORLD_BUILDER,
  SYSTEM_SKILL_CHARACTER_DESIGNER,
  SYSTEM_SKILL_EXPECTATION_MANAGER,
  SYSTEM_SKILL_PLEASURE_RHYTHM,
  SYSTEM_SKILL_WORLD_BUILDER,
  PALACE_SKILL_CHARACTER_DESIGNER,
  PALACE_SKILL_EXPECTATION_MANAGER,
  PALACE_SKILL_PLEASURE_RHYTHM,
  PALACE_SKILL_WORLD_BUILDER,
  MYSTERY_SKILL_CHARACTER_DESIGNER,
  MYSTERY_SKILL_EXPECTATION_MANAGER,
  MYSTERY_SKILL_PLEASURE_RHYTHM,
  MYSTERY_SKILL_WORLD_BUILDER,
  ROMANCE_SKILL_CHARACTER_DESIGNER,
  ROMANCE_SKILL_EXPECTATION_MANAGER,
  ROMANCE_SKILL_PLEASURE_RHYTHM,
  ROMANCE_SKILL_WORLD_BUILDER,
  SCIFI_SKILL_CHARACTER_DESIGNER,
  SCIFI_SKILL_EXPECTATION_MANAGER,
  SCIFI_SKILL_PLEASURE_RHYTHM,
  SCIFI_SKILL_WORLD_BUILDER,
  WUXIA_SKILL_CHARACTER_DESIGNER,
  WUXIA_SKILL_EXPECTATION_MANAGER,
  WUXIA_SKILL_PLEASURE_RHYTHM,
  WUXIA_SKILL_WORLD_BUILDER,
  GAME_SKILL_CHARACTER_DESIGNER,
  GAME_SKILL_EXPECTATION_MANAGER,
  GAME_SKILL_PLEASURE_RHYTHM,
  GAME_SKILL_WORLD_BUILDER,
  HISTORY_SKILL_CHARACTER_DESIGNER,
  HISTORY_SKILL_EXPECTATION_MANAGER,
  HISTORY_SKILL_PLEASURE_RHYTHM,
  HISTORY_SKILL_WORLD_BUILDER,
  INFINITE_SKILL_CHARACTER_DESIGNER,
  INFINITE_SKILL_EXPECTATION_MANAGER,
  INFINITE_SKILL_PLEASURE_RHYTHM,
  INFINITE_SKILL_WORLD_BUILDER,
  HONGHUANG_SKILL_CHARACTER_DESIGNER,
  HONGHUANG_SKILL_EXPECTATION_MANAGER,
  HONGHUANG_SKILL_PLEASURE_RHYTHM,
  HONGHUANG_SKILL_WORLD_BUILDER,
  GAME_LIT_SKILL_CHARACTER_DESIGNER,
  GAME_LIT_SKILL_EXPECTATION_MANAGER,
  GAME_LIT_SKILL_PLEASURE_RHYTHM,
  GAME_LIT_SKILL_WORLD_BUILDER,
  LIVESTREAM_SKILL_CHARACTER_DESIGNER,
  LIVESTREAM_SKILL_EXPECTATION_MANAGER,
  LIVESTREAM_SKILL_PLEASURE_RHYTHM,
  LIVESTREAM_SKILL_WORLD_BUILDER,
  COSMIC_HORROR_SKILL_CHARACTER_DESIGNER,
  COSMIC_HORROR_SKILL_EXPECTATION_MANAGER,
  COSMIC_HORROR_SKILL_PLEASURE_RHYTHM,
  COSMIC_HORROR_SKILL_WORLD_BUILDER,
  HISTORY_TRAVEL_SKILL_CHARACTER_DESIGNER,
  HISTORY_TRAVEL_SKILL_EXPECTATION_MANAGER,
  HISTORY_TRAVEL_SKILL_PLEASURE_RHYTHM,
  HISTORY_TRAVEL_SKILL_WORLD_BUILDER
} from './skills';

// 玄幻修仙文风规范
const XUANHUAN_STYLE = `# 玄幻修仙文风规范

## 叙事风格
- 注重境界体系的清晰展示
- 强调修炼过程的仪式感
- 突出实力差距带来的压迫感
- 重视打脸和装逼的节奏

## 对话风格
- 前辈高人：言简意赅，高深莫测
- 同辈：竞争意识，暗藏锋芒
- 反派：狂妄自大，目中无人

## 描写重点
- 功法运转的细节描写
- 境界突破的震撼场面
- 法宝灵器的威能展示
- 宗门势力的恢弘气势
`;

// 都市重生文风规范
const URBAN_STYLE = `# 都市重生文风规范

## 叙事风格
- 快节奏，高密度爽点
- 强调信息差带来的优势
- 突出财富积累的快感
- 注重打脸的即时性

## 对话风格
- 主角：淡定从容，胸有成竹
- 反派：短视傲慢，自取其辱
- 配角：震惊崇拜，反差强烈

## 描写重点
- 商业布局的精准预判
- 财富增长的具体数字
- 社会地位的快速提升
- 人脉关系的巧妙运用
`;

// 系统流文风规范
const SYSTEM_STYLE = `# 系统流文风规范

## 叙事风格
- 数据化呈现成长过程
- 强调任务奖励的即时反馈
- 突出系统的存在感
- 注重升级的爽快感

## 对话风格
- 系统：机械提示，简洁明了
- 主角：与系统互动，吐槽调侃
- NPC：惊讶于主角的快速成长

## 描写重点
- 属性面板的变化
- 任务完成的奖励展示
- 技能效果的数值体现
- 等级提升的仪式感
`;

// 宫斗权谋文风规范
const PALACE_STYLE = `# 宫斗权谋文风规范

## 叙事风格
- 慢节奏，重铺垫
- 强调计谋的精妙
- 突出人心的复杂
- 注重反转的震撼

## 对话风格
- 明面：温文尔雅，暗藏机锋
- 暗地：冷酷算计，步步为营
- 心理：细腻刻画，层层剖析

## 描写重点
- 计谋的布局与实施
- 人物关系的微妙变化
- 权力斗争的暗流涌动
- 真相揭晓的戏剧性
`;

// 悬疑推理文风规范
const MYSTERY_STYLE = `# 悬疑推理文风规范

## 叙事风格
- 悬念迭起，层层递进
- 强调逻辑推理过程
- 突出线索的隐藏与揭示
- 注重真相的震撼性

## 对话风格
- 侦探：冷静分析，逻辑严密
- 嫌疑人：各怀心思，言辞闪烁
- 证人：提供线索，真假难辨

## 描写重点
- 案发现场的细节
- 线索的发现与分析
- 推理过程的展示
- 真相揭晓的冲击力
`;

// 言情甜宠文风规范
const ROMANCE_STYLE = `# 言情甜宠文风规范

## 叙事风格
- 轻松甜蜜，温馨治愈
- 强调情感的细腻变化
- 突出互动的甜蜜感
- 注重误会的巧妙设置

## 对话风格
- 男主：霸道宠溺，温柔体贴
- 女主：可爱俏皮，偶尔傲娇
- 互动：甜蜜撒糖，粉红泡泡

## 描写重点
- 心理活动的细腻刻画
- 肢体接触的暧昧描写
- 甜蜜场景的氛围营造
- 感情升温的自然过渡
`;

// 科幻末世文风规范
const SCIFI_STYLE = `# 科幻末世文风规范

## 叙事风格
- 紧张压抑，危机四伏
- 强调生存的艰难
- 突出科技的力量
- 注重人性的考验

## 对话风格
- 简洁有力，惜字如金
- 强调实用信息交换
- 突出团队协作

## 描写重点
- 末世环境的残酷
- 科技装备的细节
- 战斗场面的紧张
- 资源争夺的激烈
`;

// 武侠江湖文风规范
const WUXIA_STYLE = `# 武侠江湖文风规范

## 叙事风格
- 快意恩仇，侠义为先
- 强调武功的精妙
- 突出江湖的风云
- 注重恩怨的纠葛

## 对话风格
- 豪迈洒脱，义薄云天
- 恩怨分明，快意江湖
- 武学交流，惺惺相惜

## 描写重点
- 武功招式的精彩
- 江湖势力的纷争
- 侠义精神的体现
- 恩怨情仇的纠葛
`;

// 游戏竞技文风规范
const GAME_STYLE = `# 网游副本文风规范

## 叙事风格
- 节奏明快，副本刺激
- 强调副本的挑战性
- 突出装备的获得感
- 注重成长的可见性

## 对话风格
- 简洁有力，充满激情
- 战术交流，副本机制
- 通关总结，分析得失

## 描写重点
- 副本过程的紧张刺激
- Boss 战的精彩展示
- 团队配合的默契
- 装备掉落的惊喜
`;

// 历史架空文风规范
const HISTORY_STYLE = `# 历史架空文风规范

## 叙事风格
- 厚重大气，格局宏大
- 强调历史的真实感
- 突出权谋的智慧
- 注重时代的特色

## 对话风格
- 文言白话结合
- 符合时代特征
- 体现人物身份

## 描写重点
- 历史背景的还原
- 政治斗争的复杂
- 军事战争的宏大
- 时代风貌的展现
`;

// 无限流文风规范
const INFINITE_STYLE = `# 无限流文风规范

## 叙事风格
- 多元世界，创意无限
- 强调副本的独特性
- 突出能力的多样性
- 注重团队的协作

## 对话风格
- 适应不同世界风格
- 强调任务信息交流
- 突出能力分析

## 描写重点
- 副本世界的设定
- 能力体系的展示
- 战斗策略的运用
- 团队配合的精彩
`;

// 洪荒封神文风规范
const HONGHUANG_STYLE = `# 洪荒封神文风规范

## 叙事风格
- 恢弘大气，神话色彩
- 强调因果业力
- 突出法宝的威能
- 注重天道的运转

## 对话风格
- 古朴庄重，仙风道骨
- 强调道理阐述
- 突出身份地位

## 描写重点
- 神话体系的宏大
- 法宝神通的威能
- 因果业力的体现
- 天道圣人的超然
`;

// 游戏文/LitRPG文风规范
const GAME_LIT_STYLE = `# 游戏文/LitRPG文风规范

## 叙事风格
- 数据化呈现成长过程，属性面板有仪式感
- 强调金手指的限制与代价，避免无限膨胀
- 突出等级反差和以弱胜强的极致爽感
- 注重系统/数值反馈的即时性

## 对话风格
- 主角：务实冷静，数值优先，偶尔吐槽系统
- 系统：简洁机械，带偶尔的彩蛋提示
- NPC/对手：震惊于主角的异常成长速度

## 描写重点
- 属性面板变化和技能效果的具体数值
- 副本/战斗中的策略与操作细节
- 等级突破的仪式感和数值飞跃
- 排行榜变动和全服公告的冲击
`;

// 直播文文风规范
const LIVESTREAM_STYLE = `# 直播文文风规范

## 叙事风格
- 实时反馈驱动，观众弹幕参与叙事
- 强调数据可见性和增长曲线
- 突出线上人格与线下真实的反差
- 注重舆论反转和名场面制造

## 对话风格
- 直播中：互动感强，口头禅/梗多，情绪外放
- 线下：真实、疲惫、策划下一场内容
- 弹幕：多视角反馈，表情包化，节奏感强
- 对手/同行：表面友好暗中竞争

## 描写重点
- 直播间数据变化的即时描写（在线人数跳动）
- 弹幕互动的节奏感和名场面切片
- 线上人设崩塌/建立的反差冲击
- 礼物/打赏/热搜等外部反馈的爽感
`;

// 克苏鲁/宇宙恐怖文风规范
const COSMIC_HORROR_STYLE = `# 克苏鲁/宇宙恐怖文风规范

## 叙事风格
- 压抑渐变，从日常到异常的缓慢渗透
- 强调不可知、不可名状的恐惧
- 突出理智的逐渐崩溃而非怪物描写
- 注重暗示大于明写，留白大于解释

## 对话风格
- 正常时：日常对话，掩盖不安
- 异常时：语无伦次、重复、自相矛盾
- 知情者：欲言又止、暗示、警告
- 不可描述：用"那个"、"它"代指，绝不直呼其名

## 描写重点
- 环境的微妙异常（光线不对、气味变化、时间扭曲）
- 角色心理状态和理智值的渐变
- 规则污染（物理法则失效的表现）
- 真相揭示时的认知崩塌感
`;

// 历史穿越文风规范
const HISTORY_TRAVEL_STYLE = `# 历史穿越文风规范

## 叙事风格
- 厚重扎实，历史感与爽感平衡
- 强调现代知识在古代的实际应用
- 突出蝴蝶效应和历史的惯性
- 注重身份管理和文化冲突

## 对话风格
- 主角：文言白话混用，偶尔口误制造紧张感
- 古人：符合时代特征，体现阶层差异
- 互动：观念碰撞，价值观冲突
- 朝堂：言外之意、暗藏机锋

## 描写重点
- 历史场景的还原感和代入感
- 现代技术在古代的引入过程
- 蝴蝶效应的连锁反应
- 权谋布局的精妙和反转
`;

// 通用文风规范
const GENERAL_STYLE = `# 通用文风规范

## 内容比例
- 对话：50%
- 动作/心理：40%
- 环境：10%

## 叙事节奏
- 快慢结合，张弛有度
- 高潮前适当铺垫
- 爽点后短暂过渡

## 白描技巧
- 用动作展示性格
- 用细节暗示情绪
- 避免直接说教

## 侧写技巧
- 通过他人反应衬托主角
- 用环境烘托氛围
- 借物喻人

## 有限第三人称
- 主要视角跟随主角
- 适当切换到重要配角
- 避免全知视角

## 人物层次
- 主角：完整三维人物
- 核心配角：有独立动机
- 功能配角：有记忆点
- 背景板：遵守主体性原则
`;

export const PRESETS: GenrePreset[] = [
  // 1. 玄幻修仙
  {
    id: 'xuanhuan',
    name: '玄幻修仙',
    description: '修仙升级，境界突破，宗门争斗。高频爽点，注重装逼打脸和实力碾压。',
    genre: '玄幻',
    styleGuide: XUANHUAN_STYLE,
    skills: [
      '技能_世界观构建.md',
      '技能_角色设计.md',
      '技能_爽点节奏管理.md',
      '技能_期待感管理.md'
    ],
    customSkills: {
      '技能_角色设计.md': XUANHUAN_SKILL_CHARACTER_DESIGNER,
      '技能_期待感管理.md': XUANHUAN_SKILL_EXPECTATION_MANAGER,
      '技能_爽点节奏管理.md': XUANHUAN_SKILL_PLEASURE_RHYTHM,
      '技能_世界观构建.md': XUANHUAN_SKILL_WORLD_BUILDER
    },
    pleasureRhythm: {
      small: 2,
      medium: 8,
      large: 30,
      description: '高频节奏，适合修仙升级流。小爽频繁维持阅读快感，中爽配合境界突破，大爽留给卷终高潮。'
    },
    templates: XUANHUAN_TEMPLATES,
    defaultSettings: {
      wordsPerChapter: 3000,
      targetChapters: 200,
      chaptersPerVolume: 30
    }
  },

  // 2. 都市重生
  {
    id: 'urban',
    name: '都市重生',
    description: '重生归来，商战布局，打脸装逼。超高频爽点，快节奏爽文。',
    genre: '都市',
    styleGuide: URBAN_STYLE,
    skills: [
      '技能_世界观构建.md',
      '技能_角色设计.md',
      '技能_期待感管理.md',
      '技能_爽点节奏管理.md'
    ],
    customSkills: {
      '技能_世界观构建.md': URBAN_SKILL_WORLD_BUILDER,
      '技能_角色设计.md': URBAN_SKILL_CHARACTER_DESIGNER,
      '技能_期待感管理.md': URBAN_SKILL_EXPECTATION_MANAGER,
      '技能_爽点节奏管理.md': URBAN_SKILL_PLEASURE_RHYTHM
    },
    pleasureRhythm: {
      small: 1,
      medium: 5,
      large: 20,
      description: '超高频节奏，适合都市爽文。几乎每章都有小爽，快速打脸，密集爽点。'
    },
    templates: URBAN_TEMPLATES,
    defaultSettings: {
      wordsPerChapter: 2500,
      targetChapters: 150,
      chaptersPerVolume: 20
    }
  },

  // 3. 系统流
  {
    id: 'system',
    name: '系统流',
    description: '系统加身，任务升级，数据成长。持续微爽，成长可见。',
    genre: '系统',
    styleGuide: SYSTEM_STYLE,
    skills: [
      '技能_世界观构建.md',
      '技能_角色设计.md',
      '技能_爽点节奏管理.md',
      '技能_期待感管理.md'
    ],
    customSkills: {
      '技能_世界观构建.md': SYSTEM_SKILL_WORLD_BUILDER,
      '技能_角色设计.md': SYSTEM_SKILL_CHARACTER_DESIGNER,
      '技能_期待感管理.md': SYSTEM_SKILL_EXPECTATION_MANAGER,
      '技能_爽点节奏管理.md': SYSTEM_SKILL_PLEASURE_RHYTHM
    },
    pleasureRhythm: {
      small: 1,
      medium: 3,
      large: 15,
      description: '持续微爽节奏，适合系统流。任务奖励频繁，升级快感持续，大爽配合重大突破。'
    },
    templates: SYSTEM_TEMPLATES,
    defaultSettings: {
      wordsPerChapter: 2500,
      targetChapters: 180,
      chaptersPerVolume: 15
    }
  },

  // 4. 宫斗权谋
  {
    id: 'palace',
    name: '宫斗权谋',
    description: '宫廷斗争，权谋算计，步步为营。低频大爽，注重铺垫和反转。',
    genre: '宫斗',
    styleGuide: PALACE_STYLE,
    skills: [
      '技能_世界观构建.md',
      '技能_角色设计.md',
      '技能_期待感管理.md',
      '技能_爽点节奏管理.md'
    ],
    customSkills: {
      '技能_世界观构建.md': PALACE_SKILL_WORLD_BUILDER,
      '技能_角色设计.md': PALACE_SKILL_CHARACTER_DESIGNER,
      '技能_期待感管理.md': PALACE_SKILL_EXPECTATION_MANAGER,
      '技能_爽点节奏管理.md': PALACE_SKILL_PLEASURE_RHYTHM
    },
    pleasureRhythm: {
      small: 5,
      medium: 15,
      large: 50,
      description: '低频大爽节奏，适合权谋文。重铺垫轻爽点，爽点质量高于数量，真相揭晓震撼人心。'
    },
    templates: PALACE_TEMPLATES,
    defaultSettings: {
      wordsPerChapter: 3500,
      targetChapters: 120,
      chaptersPerVolume: 50
    }
  },

  // 5. 悬疑推理
  {
    id: 'mystery',
    name: '悬疑推理',
    description: '谜团重重，抽丝剥茧，真相震撼。长线铺垫，终极爆发。',
    genre: '悬疑',
    styleGuide: MYSTERY_STYLE,
    skills: [
      '技能_世界观构建.md',
      '技能_期待感管理.md',
      '技能_爽点节奏管理.md',
      '技能_角色设计.md'
    ],
    customSkills: {
      '技能_世界观构建.md': MYSTERY_SKILL_WORLD_BUILDER,
      '技能_角色设计.md': MYSTERY_SKILL_CHARACTER_DESIGNER,
      '技能_期待感管理.md': MYSTERY_SKILL_EXPECTATION_MANAGER,
      '技能_爽点节奏管理.md': MYSTERY_SKILL_PLEASURE_RHYTHM
    },
    pleasureRhythm: {
      small: 3,
      medium: 10,
      large: 999, // 全书一次
      description: '长线铺垫节奏，适合悬疑推理。小爽维持兴趣，中爽推进剧情，大爽留给真相揭晓。'
    },
    templates: MYSTERY_TEMPLATES,
    defaultSettings: {
      wordsPerChapter: 3000,
      targetChapters: 80,
      chaptersPerVolume: 80 // 通常不分卷
    }
  },

  // 6. 言情甜宠
  {
    id: 'romance',
    name: '言情甜宠',
    description: '甜蜜恋爱，宠溺互动，温馨治愈。持续小甜，高频撒糖。',
    genre: '言情',
    styleGuide: ROMANCE_STYLE,
    skills: [
      '技能_世界观构建.md',
      '技能_角色设计.md',
      '技能_期待感管理.md',
      '技能_爽点节奏管理.md'
    ],
    customSkills: {
      '技能_世界观构建.md': ROMANCE_SKILL_WORLD_BUILDER,
      '技能_角色设计.md': ROMANCE_SKILL_CHARACTER_DESIGNER,
      '技能_期待感管理.md': ROMANCE_SKILL_EXPECTATION_MANAGER,
      '技能_爽点节奏管理.md': ROMANCE_SKILL_PLEASURE_RHYTHM
    },
    pleasureRhythm: {
      small: 1,
      medium: 5,
      large: 20,
      description: '持续小甜节奏，适合甜宠文。几乎每章都有甜蜜互动，误会解除带来中爽，表白求婚是大爽。'
    },
    templates: ROMANCE_TEMPLATES,
    defaultSettings: {
      wordsPerChapter: 2000,
      targetChapters: 100,
      chaptersPerVolume: 20
    }
  },

  // 7. 通用预设
  {
    id: 'general',
    name: '通用预设',
    description: '适用于各类题材的平衡配置，中频节奏，全面技能。',
    genre: '通用',
    styleGuide: GENERAL_STYLE,
    skills: [
      '技能_世界观构建.md',
      '技能_角色设计.md',
      '技能_期待感管理.md',
      '技能_爽点节奏管理.md'
    ],
    pleasureRhythm: {
      small: 3,
      medium: 10,
      large: 30,
      description: '平衡节奏，适合大多数题材。节奏适中，爽点分布均匀，适应性强。'
    },
    templates: {},
    defaultSettings: {
      wordsPerChapter: 3000,
      targetChapters: 100,
      chaptersPerVolume: 10
    }
  },

  // 8. 科幻末世
  {
    id: 'scifi',
    name: '科幻末世',
    description: '末世求生，科技发展，基地建设。中频节奏，注重资源积累和科技突破。',
    genre: '科幻',
    styleGuide: SCIFI_STYLE,
    skills: [
      '技能_世界观构建.md',
      '技能_角色设计.md',
      '技能_爽点节奏管理.md',
      '技能_期待感管理.md'
    ],
    customSkills: {
      '技能_角色设计.md': SCIFI_SKILL_CHARACTER_DESIGNER,
      '技能_期待感管理.md': SCIFI_SKILL_EXPECTATION_MANAGER,
      '技能_爽点节奏管理.md': SCIFI_SKILL_PLEASURE_RHYTHM,
      '技能_世界观构建.md': SCIFI_SKILL_WORLD_BUILDER
    },
    pleasureRhythm: {
      small: 3,
      medium: 12,
      large: 40,
      description: '中频节奏，适合末世生存流。小爽配合资源获取，中爽配合科技突破，大爽配合重大危机解决。'
    },
    templates: SCIFI_TEMPLATES,
    defaultSettings: {
      wordsPerChapter: 3500,
      targetChapters: 150,
      chaptersPerVolume: 40
    }
  },

  // 9. 武侠江湖
  {
    id: 'wuxia',
    name: '武侠江湖',
    description: '快意恩仇，武功修炼，江湖纷争。中低频节奏，注重武学精妙和侠义精神。',
    genre: '武侠',
    styleGuide: WUXIA_STYLE,
    skills: [
      '技能_世界观构建.md',
      '技能_角色设计.md',
      '技能_爽点节奏管理.md',
      '技能_期待感管理.md'
    ],
    customSkills: {
      '技能_角色设计.md': WUXIA_SKILL_CHARACTER_DESIGNER,
      '技能_期待感管理.md': WUXIA_SKILL_EXPECTATION_MANAGER,
      '技能_爽点节奏管理.md': WUXIA_SKILL_PLEASURE_RHYTHM,
      '技能_世界观构建.md': WUXIA_SKILL_WORLD_BUILDER
    },
    pleasureRhythm: {
      small: 4,
      medium: 15,
      large: 50,
      description: '中低频节奏，适合传统武侠。小爽配合武学进展，中爽配合恩怨了结，大爽配合终极对决。'
    },
    templates: WUXIA_TEMPLATES,
    defaultSettings: {
      wordsPerChapter: 3000,
      targetChapters: 120,
      chaptersPerVolume: 50
    }
  },

  // 10. 网游副本
  {
    id: 'game',
    name: '网游副本',
    description: '副本攻略，装备收集，公会争霸。高频节奏，注重副本的紧张刺激。',
    genre: '游戏',
    styleGuide: GAME_STYLE,
    skills: [
      '技能_世界观构建.md',
      '技能_角色设计.md',
      '技能_爽点节奏管理.md',
      '技能_期待感管理.md'
    ],
    customSkills: {
      '技能_世界观构建.md': GAME_SKILL_WORLD_BUILDER,
      '技能_角色设计.md': GAME_SKILL_CHARACTER_DESIGNER,
      '技能_期待感管理.md': GAME_SKILL_EXPECTATION_MANAGER,
      '技能_爽点节奏管理.md': GAME_SKILL_PLEASURE_RHYTHM
    },
    pleasureRhythm: {
      small: 1,
      medium: 5,
      large: 20,
      description: '高频节奏，适合网游副本文。小爽配合装备掉落，中爽配合副本通关，大爽配合服务器首杀。'
    },
    templates: GAME_TEMPLATES,
    defaultSettings: {
      wordsPerChapter: 2500,
      targetChapters: 150,
      chaptersPerVolume: 20
    }
  },

  // 11. 历史架空
  {
    id: 'history',
    name: '历史架空',
    description: '穿越历史，权谋争霸，改变历史。低频节奏，注重格局和谋略。',
    genre: '历史',
    styleGuide: HISTORY_STYLE,
    skills: [
      '技能_世界观构建.md',
      '技能_角色设计.md',
      '技能_爽点节奏管理.md',
      '技能_期待感管理.md'
    ],
    customSkills: {
      '技能_角色设计.md': HISTORY_SKILL_CHARACTER_DESIGNER,
      '技能_期待感管理.md': HISTORY_SKILL_EXPECTATION_MANAGER,
      '技能_爽点节奏管理.md': HISTORY_SKILL_PLEASURE_RHYTHM,
      '技能_世界观构建.md': HISTORY_SKILL_WORLD_BUILDER
    },
    pleasureRhythm: {
      small: 5,
      medium: 20,
      large: 60,
      description: '低频节奏，适合历史架空。小爽配合小胜利，中爽配合战略成功，大爽配合改变历史。'
    },
    templates: HISTORY_TEMPLATES,
    defaultSettings: {
      wordsPerChapter: 4000,
      targetChapters: 200,
      chaptersPerVolume: 60
    }
  },

  // 12. 无限流
  {
    id: 'infinite',
    name: '无限流',
    description: '穿梭副本，能力多样，团队协作。高频节奏，注重副本的创意和爽快。',
    genre: '无限',
    styleGuide: INFINITE_STYLE,
    skills: [
      '技能_世界观构建.md',
      '技能_角色设计.md',
      '技能_爽点节奏管理.md',
      '技能_期待感管理.md'
    ],
    customSkills: {
      '技能_角色设计.md': INFINITE_SKILL_CHARACTER_DESIGNER,
      '技能_期待感管理.md': INFINITE_SKILL_EXPECTATION_MANAGER,
      '技能_爽点节奏管理.md': INFINITE_SKILL_PLEASURE_RHYTHM,
      '技能_世界观构建.md': INFINITE_SKILL_WORLD_BUILDER
    },
    pleasureRhythm: {
      small: 2,
      medium: 8,
      large: 25,
      description: '高频节奏，适合无限流。小爽配合任务完成，中爽配合副本通关，大爽配合终极副本。'
    },
    templates: INFINITE_TEMPLATES,
    defaultSettings: {
      wordsPerChapter: 3000,
      targetChapters: 180,
      chaptersPerVolume: 25
    }
  },

  // 13. 洪荒封神
  {
    id: 'honghuang',
    name: '洪荒封神',
    description: '洪荒世界，封神量劫，因果业力。中频节奏，注重神话体系和法宝威能。',
    genre: '洪荒',
    styleGuide: HONGHUANG_STYLE,
    skills: [
      '技能_世界观构建.md',
      '技能_角色设计.md',
      '技能_爽点节奏管理.md',
      '技能_期待感管理.md'
    ],
    customSkills: {
      '技能_角色设计.md': HONGHUANG_SKILL_CHARACTER_DESIGNER,
      '技能_期待感管理.md': HONGHUANG_SKILL_EXPECTATION_MANAGER,
      '技能_爽点节奏管理.md': HONGHUANG_SKILL_PLEASURE_RHYTHM,
      '技能_世界观构建.md': HONGHUANG_SKILL_WORLD_BUILDER
    },
    pleasureRhythm: {
      small: 3,
      medium: 10,
      large: 35,
      description: '中频节奏，适合洪荒封神。小爽配合法宝获得，中爽配合境界突破，大爽配合量劫关键。'
    },
    templates: HONGHUANG_TEMPLATES,
    defaultSettings: {
      wordsPerChapter: 3500,
      targetChapters: 200,
      chaptersPerVolume: 35
    }
  },

  // 14. 游戏文/LitRPG
  {
    id: 'gameLit',
    name: '游戏文/LitRPG',
    description: '数值面板可见，金手指驱动成长，副本攻略升级。高频爽点，极致反差。',
    genre: '游戏',
    styleGuide: GAME_LIT_STYLE,
    skills: [
      '技能_世界观构建.md',
      '技能_角色设计.md',
      '技能_爽点节奏管理.md',
      '技能_期待感管理.md'
    ],
    customSkills: {
      '技能_世界观构建.md': GAME_LIT_SKILL_WORLD_BUILDER,
      '技能_角色设计.md': GAME_LIT_SKILL_CHARACTER_DESIGNER,
      '技能_期待感管理.md': GAME_LIT_SKILL_EXPECTATION_MANAGER,
      '技能_爽点节奏管理.md': GAME_LIT_SKILL_PLEASURE_RHYTHM
    },
    pleasureRhythm: {
      small: 1,
      medium: 4,
      large: 15,
      description: '超高频节奏，适合游戏文/LitRPG。小爽配合属性提升，中爽配合副本通关/等级突破，大爽配合全服事件/终极对决。'
    },
    templates: GAME_LIT_TEMPLATES,
    defaultSettings: {
      wordsPerChapter: 2500,
      targetChapters: 200,
      chaptersPerVolume: 20
    }
  },

  // 15. 直播文
  {
    id: 'livestream',
    name: '直播文',
    description: '实时互动，数据为王，舆论反转。高频节奏，观众弹幕参与叙事。',
    genre: '直播',
    styleGuide: LIVESTREAM_STYLE,
    skills: [
      '技能_世界观构建.md',
      '技能_角色设计.md',
      '技能_爽点节奏管理.md',
      '技能_期待感管理.md'
    ],
    customSkills: {
      '技能_世界观构建.md': LIVESTREAM_SKILL_WORLD_BUILDER,
      '技能_角色设计.md': LIVESTREAM_SKILL_CHARACTER_DESIGNER,
      '技能_期待感管理.md': LIVESTREAM_SKILL_EXPECTATION_MANAGER,
      '技能_爽点节奏管理.md': LIVESTREAM_SKILL_PLEASURE_RHYTHM
    },
    pleasureRhythm: {
      small: 1,
      medium: 5,
      large: 20,
      description: '高频节奏，适合直播文。小爽配合数据增长/弹幕互动，中爽配合名场面/热搜，大爽配合全网爆红/舆论大反转。'
    },
    templates: LIVESTREAM_TEMPLATES,
    defaultSettings: {
      wordsPerChapter: 2500,
      targetChapters: 150,
      chaptersPerVolume: 20
    }
  },

  // 16. 克苏鲁/宇宙恐怖
  {
    id: 'cosmicHorror',
    name: '克苏鲁/宇宙恐怖',
    description: '不可名状的恐惧，理智渐崩，真相代价。低频大爆发，压抑累积型。',
    genre: '恐怖',
    styleGuide: COSMIC_HORROR_STYLE,
    skills: [
      '技能_世界观构建.md',
      '技能_角色设计.md',
      '技能_爽点节奏管理.md',
      '技能_期待感管理.md'
    ],
    customSkills: {
      '技能_世界观构建.md': COSMIC_HORROR_SKILL_WORLD_BUILDER,
      '技能_角色设计.md': COSMIC_HORROR_SKILL_CHARACTER_DESIGNER,
      '技能_期待感管理.md': COSMIC_HORROR_SKILL_EXPECTATION_MANAGER,
      '技能_爽点节奏管理.md': COSMIC_HORROR_SKILL_PLEASURE_RHYTHM
    },
    pleasureRhythm: {
      small: 5,
      medium: 20,
      large: 60,
      description: '低频大爆发节奏，适合宇宙恐怖。小爽配合生存逃脱/线索发现，中爽配合真相揭露/规则突破，大爽配合认知翻转/世界观重建。'
    },
    templates: COSMIC_HORROR_TEMPLATES,
    defaultSettings: {
      wordsPerChapter: 3000,
      targetChapters: 100,
      chaptersPerVolume: 25
    }
  },

  // 17. 历史穿越
  {
    id: 'historyTravel',
    name: '历史穿越',
    description: '穿越古今，知识优势，种田争霸。中频节奏，注重蝴蝶效应和历史惯性。',
    genre: '历史穿越',
    styleGuide: HISTORY_TRAVEL_STYLE,
    skills: [
      '技能_世界观构建.md',
      '技能_角色设计.md',
      '技能_爽点节奏管理.md',
      '技能_期待感管理.md'
    ],
    customSkills: {
      '技能_世界观构建.md': HISTORY_TRAVEL_SKILL_WORLD_BUILDER,
      '技能_角色设计.md': HISTORY_TRAVEL_SKILL_CHARACTER_DESIGNER,
      '技能_期待感管理.md': HISTORY_TRAVEL_SKILL_EXPECTATION_MANAGER,
      '技能_爽点节奏管理.md': HISTORY_TRAVEL_SKILL_PLEASURE_RHYTHM
    },
    pleasureRhythm: {
      small: 3,
      medium: 12,
      large: 40,
      description: '中频节奏，适合历史穿越。小爽配合知识应用成功，中爽配合势力扩张/历史改变，大爽配合改写历史大事件。'
    },
    templates: HISTORY_TRAVEL_TEMPLATES,
    defaultSettings: {
      wordsPerChapter: 3500,
      targetChapters: 200,
      chaptersPerVolume: 40
    }
  }
];
