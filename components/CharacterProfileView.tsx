import React, { useMemo } from 'react';
import {
  Activity,
  Brain,
  Clock3,
  HeartHandshake,
  MapPin,
  Sparkles,
  Target,
  User,
} from 'lucide-react';
import { CharacterGoal, CharacterProfile, CharacterRelationship } from '../types';
import { useCharacterMemoryStore } from '../stores/characterMemoryStore';

interface CharacterProfileViewProps {
  filePath: string;
  content?: string;
}

const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(35,39,46,0.96) 0%, rgba(24,27,33,0.96) 100%)',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  borderRadius: 16,
  padding: 18,
  boxShadow: '0 18px 40px rgba(0, 0, 0, 0.22)',
};

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(56, 189, 248, 0.12)',
  border: '1px solid rgba(56, 189, 248, 0.2)',
  color: '#bae6fd',
  fontSize: 12,
  lineHeight: 1.4,
};

const unicodeProfileFolder = '\u0030\u0032_\u89d2\u8272\u6863\u6848/\u89d2\u8272\u72b6\u6001\u4e0e\u8bb0\u5fc6/';

const normalizeGoalStatus = (status: CharacterGoal['status']) => {
  switch (status) {
    case 'active':
      return { label: '进行中', color: '#34d399' };
    case 'blocked':
      return { label: '受阻', color: '#f87171' };
    case 'completed':
      return { label: '已完成', color: '#fbbf24' };
    case 'latent':
      return { label: '潜在', color: '#a78bfa' };
    default:
      return { label: status, color: '#94a3b8' };
  }
};

const normalizeGoalPriority = (priority: CharacterGoal['priority']) => {
  switch (priority) {
    case 'high':
      return '高';
    case 'medium':
      return '中';
    case 'low':
      return '低';
    default:
      return priority;
  }
};

const normalizeRelationshipConfidence = (relationship: CharacterRelationship) => {
  switch (relationship.confidence) {
    case 'high':
      return { label: '高置信', color: '#38bdf8' };
    case 'medium':
      return { label: '中置信', color: '#fbbf24' };
    case 'low':
      return { label: '低置信', color: '#94a3b8' };
    default:
      return { label: relationship.confidence, color: '#94a3b8' };
  }
};

const formatTime = (timestamp?: number) => {
  if (!timestamp) return '未记录';

  try {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '未记录';
  }
};

const deriveCharacterName = (filePath: string) => {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const fileName = normalizedPath.split('/').pop() || '';
  return fileName.replace(/\.json$/i, '').trim();
};

const parseFallbackProfile = (content?: string) => {
  if (!content) return undefined;

  try {
    return JSON.parse(content) as CharacterProfile;
  } catch {
    return undefined;
  }
};

const Section: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }> = ({
  icon,
  title,
  subtitle,
  children,
}) => (
  <section style={cardStyle}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          display: 'grid',
          placeItems: 'center',
          background: 'rgba(59, 130, 246, 0.14)',
          color: '#93c5fd',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{subtitle}</div> : null}
      </div>
    </div>
    {children}
  </section>
);

export const CharacterProfileView: React.FC<CharacterProfileViewProps> = ({ filePath, content }) => {
  const profiles = useCharacterMemoryStore((state) => state.profiles);
  const characterName = useMemo(() => deriveCharacterName(filePath), [filePath]);
  const fallbackProfile = useMemo(() => parseFallbackProfile(content), [content]);
  const profile = useMemo(
    () =>
      profiles.find((item) => item.characterName.trim().toLowerCase() === characterName.trim().toLowerCase()) ||
      fallbackProfile,
    [characterName, fallbackProfile, profiles]
  );

  if (!profile) {
    return (
      <div
        style={{
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          background:
            'radial-gradient(circle at top, rgba(14, 116, 144, 0.16), transparent 40%), linear-gradient(180deg, #0f172a 0%, #111827 100%)',
          color: '#cbd5e1',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 560, textAlign: 'center' }}>
          <User size={42} style={{ marginBottom: 14, color: '#38bdf8' }} />
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>角色档案尚未生成</div>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: '#94a3b8' }}>
            当前文件位于 <code>{unicodeProfileFolder}</code>，但还没有可渲染的角色画像数据。
          </div>
        </div>
      </div>
    );
  }

  const latestState = profile.latestState;

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: 24,
        background:
          'radial-gradient(circle at top left, rgba(14, 165, 233, 0.16), transparent 34%), radial-gradient(circle at top right, rgba(34, 197, 94, 0.12), transparent 28%), linear-gradient(180deg, #0f172a 0%, #111827 100%)',
        color: '#e2e8f0',
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <section
          style={{
            ...cardStyle,
            padding: 24,
            background:
              'linear-gradient(135deg, rgba(14, 116, 144, 0.18) 0%, rgba(15, 23, 42, 0.98) 44%, rgba(22, 101, 52, 0.22) 100%)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
              alignItems: 'flex-start',
            }}
          >
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 18,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  color: '#67e8f9',
                  flexShrink: 0,
                }}
              >
                <User size={28} />
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>{profile.characterName}</div>
                <div style={{ fontSize: 15, lineHeight: 1.8, color: '#cbd5e1', maxWidth: 720 }}>
                  {profile.personaSummary || '暂无人设摘要，后续可通过正文状态和角色规则继续沉淀。'}
                </div>
                {profile.aliases.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    {profile.aliases.map((alias) => (
                      <span key={alias} style={pillStyle}>
                        别名 · {alias}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 12, minWidth: 320, flex: 1 }}>
              <MetricCard label="最新状态" value={latestState ? '已同步' : '待补全'} accent="#38bdf8" />
              <MetricCard label="关系节点" value={String(profile.relationships.length)} accent="#34d399" />
              <MetricCard label="当前目标" value={String(profile.goals.filter((goal) => goal.status !== 'completed').length)} accent="#f59e0b" />
              <MetricCard label="角色记忆" value={String(profile.memories.length)} accent="#a78bfa" />
            </div>
          </div>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 18 }}>
          <Section icon={<Sparkles size={18} />} title="人设与主观能动性" subtitle="用于稳定角色行为边界、气质和行动逻辑">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>核心特质</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {profile.coreTraits.length > 0 ? (
                    profile.coreTraits.map((trait) => (
                      <span
                        key={trait}
                        style={{
                          ...pillStyle,
                          background: 'rgba(34, 197, 94, 0.12)',
                          border: '1px solid rgba(34, 197, 94, 0.18)',
                          color: '#bbf7d0',
                        }}
                      >
                        {trait}
                      </span>
                    ))
                  ) : (
                    <EmptyInline text="还没有抽取到稳定特质，可通过角色规则记忆或章节分析继续沉淀。" />
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>行动驱动</div>
                {profile.agencyNotes.length > 0 ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {profile.agencyNotes.map((note) => (
                      <div
                        key={note}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 12,
                          background: 'rgba(15, 23, 42, 0.65)',
                          border: '1px solid rgba(148, 163, 184, 0.12)',
                          color: '#e2e8f0',
                          lineHeight: 1.7,
                          fontSize: 14,
                        }}
                      >
                        {note}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyInline text="还没有识别到明确动机，后续可从正文变化和角色规则里继续提炼。" />
                )}
              </div>
            </div>
          </Section>

          <Section icon={<Activity size={18} />} title="当前状态" subtitle="基于最近一次章节状态抽取">
            {latestState ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <InfoRow label="状态描述" value={latestState.stateDescription} />
                <InfoRow label="情绪" value={latestState.emotionalState || '未记录'} />
                <InfoRow label="位置" value={latestState.location || '未记录'} icon={<MapPin size={14} />} />
                <InfoRow label="来源章节" value={latestState.chapterTitle} icon={<Clock3 size={14} />} />
                <div>
                  <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>近期变化</div>
                  {latestState.changes.length > 0 ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {latestState.changes.map((change) => (
                        <div
                          key={change}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 12,
                            background: 'rgba(30, 41, 59, 0.66)',
                            border: '1px solid rgba(148, 163, 184, 0.12)',
                            lineHeight: 1.7,
                            fontSize: 14,
                          }}
                        >
                          {change}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyInline text="暂无状态变化记录。" />
                  )}
                </div>
              </div>
            ) : (
              <EmptyInline text="还没有章节状态快照。" />
            )}
          </Section>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '0.95fr 1.05fr', gap: 18 }}>
          <Section icon={<Target size={18} />} title="目标与推进线" subtitle="用来刻画角色意图、计划和阻碍">
            {profile.goals.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {profile.goals.map((goal) => {
                  const status = normalizeGoalStatus(goal.status);
                  return (
                    <div
                      key={goal.id}
                      style={{
                        padding: 14,
                        borderRadius: 14,
                        background: 'rgba(17, 24, 39, 0.72)',
                        border: '1px solid rgba(148, 163, 184, 0.12)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 15, color: '#f8fafc', fontWeight: 600 }}>{goal.description}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ ...pillStyle, background: `${status.color}1f`, border: `1px solid ${status.color}33`, color: status.color }}>
                            {status.label}
                          </span>
                          <span
                            style={{
                              ...pillStyle,
                              background: 'rgba(148, 163, 184, 0.14)',
                              border: '1px solid rgba(148, 163, 184, 0.18)',
                              color: '#cbd5e1',
                            }}
                          >
                            优先级 · {normalizeGoalPriority(goal.priority)}
                          </span>
                        </div>
                      </div>
                      {goal.evidence ? (
                        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: '#94a3b8' }}>{goal.evidence}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyInline text="还没有抽取到明确目标，可从状态变化或角色规则里继续沉淀。" />
            )}
          </Section>

          <Section icon={<HeartHandshake size={18} />} title="关系网" subtitle="当前角色对外部人物的显性关系节点">
            {profile.relationships.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {profile.relationships.map((relationship) => {
                  const confidence = normalizeRelationshipConfidence(relationship);
                  return (
                    <div
                      key={relationship.characterName}
                      style={{
                        padding: 14,
                        borderRadius: 14,
                        background: 'rgba(15, 23, 42, 0.72)',
                        border: '1px solid rgba(148, 163, 184, 0.12)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>{relationship.characterName}</div>
                        <span
                          style={{
                            ...pillStyle,
                            background: `${confidence.color}1a`,
                            border: `1px solid ${confidence.color}33`,
                            color: confidence.color,
                          }}
                        >
                          {confidence.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.7 }}>{relationship.status}</div>
                      {relationship.summary ? (
                        <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>{relationship.summary}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyInline text="还没有关系节点，后续会随着章节状态抽取逐步形成。" />
            )}
          </Section>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <Section icon={<Brain size={18} />} title="角色记忆" subtitle="来自长期记忆系统中的角色规则与稳定事实">
            {profile.memories.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {profile.memories.slice(0, 8).map((memory) => (
                  <div
                    key={memory.memoryId}
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      background: 'rgba(15, 23, 42, 0.68)',
                      border: '1px solid rgba(148, 163, 184, 0.12)',
                    }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc', marginBottom: 6 }}>{memory.name}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.7, color: '#cbd5e1' }}>{memory.summary || memory.content}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyInline text="还没有角色记忆条目。" />
            )}
          </Section>

          <Section icon={<Clock3 size={18} />} title="状态轨迹" subtitle="按章节累积的角色状态时间线">
            {profile.stateHistory.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {[...profile.stateHistory].reverse().slice(0, 8).map((snapshot) => (
                  <div
                    key={`${snapshot.chapterPath}-${snapshot.extractedAt}`}
                    style={{
                      position: 'relative',
                      padding: '12px 14px 12px 18px',
                      borderRadius: 14,
                      background: 'rgba(15, 23, 42, 0.68)',
                      border: '1px solid rgba(148, 163, 184, 0.12)',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: 8,
                        top: 18,
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#38bdf8',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>{snapshot.chapterTitle}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{formatTime(snapshot.extractedAt)}</div>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7, color: '#cbd5e1' }}>{snapshot.stateDescription}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyInline text="还没有状态时间线。" />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; accent: string }> = ({ label, value, accent }) => (
  <div
    style={{
      padding: 14,
      borderRadius: 14,
      background: 'rgba(15, 23, 42, 0.5)',
      border: '1px solid rgba(148, 163, 184, 0.14)',
    }}
  >
    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 700, color: accent }}>{value}</div>
  </div>
);

const InfoRow: React.FC<{ label: string; value: string; icon?: React.ReactNode }> = ({ label, value, icon }) => (
  <div
    style={{
      padding: '12px 14px',
      borderRadius: 14,
      background: 'rgba(15, 23, 42, 0.6)',
      border: '1px solid rgba(148, 163, 184, 0.12)',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
      {icon}
      <span>{label}</span>
    </div>
    <div style={{ fontSize: 14, lineHeight: 1.7, color: '#e2e8f0' }}>{value}</div>
  </div>
);

const EmptyInline: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      padding: '12px 14px',
      borderRadius: 12,
      border: '1px dashed rgba(148, 163, 184, 0.22)',
      color: '#94a3b8',
      fontSize: 13,
      lineHeight: 1.7,
    }}
  >
    {text}
  </div>
);
