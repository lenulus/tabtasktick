/**
 * Per-locale realistic content for store screenshots.
 *
 * The UI chrome (buttons/labels) is localized by overwriting _locales/en with
 * the target locale's messages.json (see capture.mjs). The *content* below is
 * user data and does NOT auto-translate, so each locale should carry its own
 * natively-written set for professional store assets.
 *
 * For THIS task only `en` is filled. The other 6 locales fall back to `en` via
 * `getContent(locale)`. When translations are added, add a key per locale and
 * the fan-out picks it up automatically.
 *
 * Shapes (verified against services):
 *  - collection: { name, description, icon, color, tags }
 *  - folder:     { name, color }   color ∈ grey|blue|red|yellow|green|pink|purple|cyan|orange
 *  - tabs[]:     { url, title, note }   note ≤ 255 chars; rendered only when non-empty
 *  - tasks[]:    { summary, status, priority, notes }
 *                status ∈ open|active|fixed|abandoned (the four Kanban columns)
 *                priority ∈ low|medium|high (urgent also valid)
 *  - rule:       { name } (full rule object built in capture.mjs)
 */

export const CONTENT = {
  en: {
    collection: {
      name: 'Q3 Product Launch',
      description: 'Everything for the September launch — assets, specs, and go-to-market.',
      icon: '🚀',
      color: '#667eea',
      tags: ['launch', 'q3', 'priority'],
    },
    folder: {
      name: 'Launch assets',
      color: 'blue',
    },
    tabs: [
      {
        url: 'https://www.figma.com/file/launch-hero-mockups',
        title: 'Hero mockups — Figma',
        note: 'Use variant B for the homepage banner. Final sign-off Friday.',
      },
      {
        url: 'https://docs.google.com/document/d/launch-checklist',
        title: 'Launch checklist (Google Docs)',
        note: 'Blocked on legal review of the pricing page — ping Dana.',
      },
      {
        url: 'https://www.notion.so/Press-Kit-and-Messaging',
        title: 'Press kit & messaging — Notion',
        note: 'Embargo lifts 9 AM ET on launch day. Send to press list T-2.',
      },
      {
        url: 'https://app.mixpanel.com/dashboard/activation-funnel',
        title: 'Activation funnel — Mixpanel',
        note: 'Watch day-1 activation; alert if signup→activate drops below 40%.',
      },
      {
        url: 'https://github.com/acme/launch-site/pull/482',
        title: 'PR #482: Pricing page redesign',
        note: 'Needs one more approval before we can deploy to staging.',
      },
      {
        url: 'https://calendly.com/acme-launch/go-no-go',
        title: 'Go / No-Go review — Calendly',
        note: 'Exec go/no-go is Thursday 2 PM. Have metrics dashboard ready.',
      },
    ],
    tasks: [
      {
        summary: 'Draft launch announcement blog post',
        status: 'active',
        priority: 'high',
        notes: 'First draft to comms by Wednesday for review.',
      },
      {
        summary: 'Finalize pricing page copy',
        status: 'active',
        priority: 'high',
        notes: 'Waiting on legal sign-off — last blocker before deploy.',
      },
      {
        summary: 'QA the new onboarding flow',
        status: 'open',
        priority: 'medium',
        notes: 'Cover mobile Safari and the invite-link edge case.',
      },
      {
        summary: 'Schedule social media teasers',
        status: 'open',
        priority: 'low',
        notes: 'Three teasers across the week leading up to launch.',
      },
      {
        summary: 'Set up activation funnel dashboard',
        status: 'fixed',
        priority: 'medium',
        notes: 'Live in Mixpanel; shared with the leadership channel.',
      },
      {
        summary: 'Brief the support team on new features',
        status: 'fixed',
        priority: 'high',
        notes: 'Walkthrough done; FAQ and macros published.',
      },
      {
        summary: 'Run paid retargeting campaign',
        status: 'abandoned',
        priority: 'low',
        notes: 'Cut from scope this quarter — revisit for the Q4 push.',
      },
    ],
    rule: {
      name: 'Group tabs by domain',
      description: 'When 2+ tabs share a domain, auto-group them so the strip stays tidy.',
    },
  },

  de: {
    collection: {
      name: 'Produktlaunch Q3',
      description: 'Alles für den September-Launch — Assets, Specs und Go-to-Market.',
      icon: '🚀',
      color: '#667eea',
      tags: ['launch', 'q3', 'priorität'],
    },
    folder: {
      name: 'Launch-Assets',
      color: 'blue',
    },
    tabs: [
      {
        url: 'https://www.figma.com/file/launch-hero-mockups',
        title: 'Hero-Mockups — Figma',
        note: 'Variante B für das Startseiten-Banner verwenden. Finale Freigabe am Freitag.',
      },
      {
        url: 'https://docs.google.com/document/d/launch-checklist',
        title: 'Launch-Checkliste (Google Docs)',
        note: 'Blockiert durch die rechtliche Prüfung der Preisseite — Dana anpingen.',
      },
      {
        url: 'https://www.notion.so/Press-Kit-and-Messaging',
        title: 'Pressekit & Messaging — Notion',
        note: 'Sperrfrist endet am Launch-Tag um 9 Uhr ET. Presseliste an T-2 senden.',
      },
      {
        url: 'https://app.mixpanel.com/dashboard/activation-funnel',
        title: 'Aktivierungs-Funnel — Mixpanel',
        note: 'Tag-1-Aktivierung beobachten; warnen, wenn Signup→Aktivierung unter 40 % fällt.',
      },
      {
        url: 'https://github.com/acme/launch-site/pull/482',
        title: 'PR #482: Redesign der Preisseite',
        note: 'Braucht noch eine Freigabe, bevor wir auf Staging deployen können.',
      },
      {
        url: 'https://calendly.com/acme-launch/go-no-go',
        title: 'Go-/No-Go-Review — Calendly',
        note: 'Go/No-Go der Geschäftsführung am Donnerstag 14 Uhr. Metriken-Dashboard bereithalten.',
      },
    ],
    tasks: [
      {
        summary: 'Blogbeitrag zur Launch-Ankündigung entwerfen',
        status: 'active',
        priority: 'high',
        notes: 'Erster Entwurf bis Mittwoch zur Prüfung an Comms.',
      },
      {
        summary: 'Texte der Preisseite finalisieren',
        status: 'active',
        priority: 'high',
        notes: 'Warten auf rechtliche Freigabe — letzter Blocker vor dem Deploy.',
      },
      {
        summary: 'Neuen Onboarding-Flow testen (QA)',
        status: 'open',
        priority: 'medium',
        notes: 'Mobile Safari und den Sonderfall mit Einladungslinks abdecken.',
      },
      {
        summary: 'Social-Media-Teaser planen',
        status: 'open',
        priority: 'low',
        notes: 'Drei Teaser über die Woche vor dem Launch verteilt.',
      },
      {
        summary: 'Dashboard für Aktivierungs-Funnel einrichten',
        status: 'fixed',
        priority: 'medium',
        notes: 'Live in Mixpanel; mit dem Leadership-Kanal geteilt.',
      },
      {
        summary: 'Support-Team zu den neuen Features briefen',
        status: 'fixed',
        priority: 'high',
        notes: 'Walkthrough erledigt; FAQ und Makros veröffentlicht.',
      },
      {
        summary: 'Bezahlte Retargeting-Kampagne durchführen',
        status: 'abandoned',
        priority: 'low',
        notes: 'Dieses Quartal aus dem Umfang gestrichen — für den Q4-Push erneut prüfen.',
      },
    ],
    rule: {
      name: 'Tabs nach Domain gruppieren',
      description: 'Bei 2+ Tabs derselben Domain automatisch gruppieren, damit die Leiste aufgeräumt bleibt.',
    },
  },

  es: {
    collection: {
      name: 'Lanzamiento de producto Q3',
      description: 'Todo para el lanzamiento de septiembre: recursos, especificaciones y go-to-market.',
      icon: '🚀',
      color: '#667eea',
      tags: ['lanzamiento', 'q3', 'prioridad'],
    },
    folder: {
      name: 'Recursos del lanzamiento',
      color: 'blue',
    },
    tabs: [
      {
        url: 'https://www.figma.com/file/launch-hero-mockups',
        title: 'Mockups del hero — Figma',
        note: 'Usar la variante B para el banner de la página de inicio. Aprobación final el viernes.',
      },
      {
        url: 'https://docs.google.com/document/d/launch-checklist',
        title: 'Lista de verificación del lanzamiento (Google Docs)',
        note: 'Bloqueado por la revisión legal de la página de precios — avisar a Dana.',
      },
      {
        url: 'https://www.notion.so/Press-Kit-and-Messaging',
        title: 'Kit de prensa y mensajes — Notion',
        note: 'El embargo se levanta a las 9 a. m. ET el día del lanzamiento. Enviar a prensa en T-2.',
      },
      {
        url: 'https://app.mixpanel.com/dashboard/activation-funnel',
        title: 'Embudo de activación — Mixpanel',
        note: 'Vigilar la activación del día 1; alertar si registro→activación baja del 40 %.',
      },
      {
        url: 'https://github.com/acme/launch-site/pull/482',
        title: 'PR #482: Rediseño de la página de precios',
        note: 'Necesita una aprobación más antes de poder desplegar en staging.',
      },
      {
        url: 'https://calendly.com/acme-launch/go-no-go',
        title: 'Revisión Go/No-Go — Calendly',
        note: 'El go/no-go ejecutivo es el jueves a las 2 p. m. Tener listo el dashboard de métricas.',
      },
    ],
    tasks: [
      {
        summary: 'Redactar el artículo de anuncio del lanzamiento',
        status: 'active',
        priority: 'high',
        notes: 'Primer borrador a comunicación para el miércoles para su revisión.',
      },
      {
        summary: 'Finalizar el texto de la página de precios',
        status: 'active',
        priority: 'high',
        notes: 'A la espera del visto bueno legal — último bloqueo antes del despliegue.',
      },
      {
        summary: 'Hacer QA del nuevo flujo de onboarding',
        status: 'open',
        priority: 'medium',
        notes: 'Cubrir Safari móvil y el caso límite del enlace de invitación.',
      },
      {
        summary: 'Programar los teasers en redes sociales',
        status: 'open',
        priority: 'low',
        notes: 'Tres teasers a lo largo de la semana previa al lanzamiento.',
      },
      {
        summary: 'Configurar el dashboard del embudo de activación',
        status: 'fixed',
        priority: 'medium',
        notes: 'En vivo en Mixpanel; compartido con el canal de liderazgo.',
      },
      {
        summary: 'Informar al equipo de soporte sobre las nuevas funciones',
        status: 'fixed',
        priority: 'high',
        notes: 'Demostración hecha; FAQ y macros publicados.',
      },
      {
        summary: 'Lanzar campaña de retargeting de pago',
        status: 'abandoned',
        priority: 'low',
        notes: 'Fuera del alcance este trimestre — retomar para el impulso de Q4.',
      },
    ],
    rule: {
      name: 'Agrupar pestañas por dominio',
      description: 'Cuando 2+ pestañas comparten dominio, agruparlas automáticamente para mantener la barra ordenada.',
    },
  },

  fr: {
    collection: {
      name: 'Lancement produit T3',
      description: 'Tout pour le lancement de septembre : ressources, specs et go-to-market.',
      icon: '🚀',
      color: '#667eea',
      tags: ['lancement', 't3', 'priorité'],
    },
    folder: {
      name: 'Ressources de lancement',
      color: 'blue',
    },
    tabs: [
      {
        url: 'https://www.figma.com/file/launch-hero-mockups',
        title: 'Maquettes hero — Figma',
        note: 'Utiliser la variante B pour la bannière d’accueil. Validation finale vendredi.',
      },
      {
        url: 'https://docs.google.com/document/d/launch-checklist',
        title: 'Checklist de lancement (Google Docs)',
        note: 'Bloqué par la revue juridique de la page tarifs — prévenir Dana.',
      },
      {
        url: 'https://www.notion.so/Press-Kit-and-Messaging',
        title: 'Kit presse & messages — Notion',
        note: 'Levée d’embargo à 9 h ET le jour du lancement. Envoyer à la presse à J-2.',
      },
      {
        url: 'https://app.mixpanel.com/dashboard/activation-funnel',
        title: 'Tunnel d’activation — Mixpanel',
        note: 'Surveiller l’activation J1 ; alerter si inscription→activation passe sous 40 %.',
      },
      {
        url: 'https://github.com/acme/launch-site/pull/482',
        title: 'PR #482 : refonte de la page tarifs',
        note: 'Nécessite une validation de plus avant de déployer en staging.',
      },
      {
        url: 'https://calendly.com/acme-launch/go-no-go',
        title: 'Revue Go / No-Go — Calendly',
        note: 'Go/no-go exécutif jeudi à 14 h. Préparer le dashboard de métriques.',
      },
    ],
    tasks: [
      {
        summary: 'Rédiger l’article de blog d’annonce du lancement',
        status: 'active',
        priority: 'high',
        notes: 'Premier jet à l’équipe comms pour mercredi, pour relecture.',
      },
      {
        summary: 'Finaliser le texte de la page tarifs',
        status: 'active',
        priority: 'high',
        notes: 'En attente du feu vert juridique — dernier blocage avant le déploiement.',
      },
      {
        summary: 'Tester (QA) le nouveau parcours d’onboarding',
        status: 'open',
        priority: 'medium',
        notes: 'Couvrir Safari mobile et le cas limite du lien d’invitation.',
      },
      {
        summary: 'Planifier les teasers sur les réseaux sociaux',
        status: 'open',
        priority: 'low',
        notes: 'Trois teasers répartis sur la semaine précédant le lancement.',
      },
      {
        summary: 'Mettre en place le dashboard du tunnel d’activation',
        status: 'fixed',
        priority: 'medium',
        notes: 'En ligne sur Mixpanel ; partagé avec le canal de la direction.',
      },
      {
        summary: 'Briefer l’équipe support sur les nouvelles fonctionnalités',
        status: 'fixed',
        priority: 'high',
        notes: 'Démo réalisée ; FAQ et macros publiées.',
      },
      {
        summary: 'Lancer une campagne de retargeting payante',
        status: 'abandoned',
        priority: 'low',
        notes: 'Retiré du périmètre ce trimestre — à revoir pour la poussée du T4.',
      },
    ],
    rule: {
      name: 'Grouper les onglets par domaine',
      description: 'Quand 2 onglets ou plus partagent un domaine, les grouper automatiquement pour garder la barre nette.',
    },
  },

  ja: {
    collection: {
      name: 'Q3 プロダクトローンチ',
      description: '9月のローンチに必要なすべて — アセット、仕様、Go-to-Market。',
      icon: '🚀',
      color: '#667eea',
      tags: ['ローンチ', 'q3', '優先'],
    },
    folder: {
      name: 'ローンチ用アセット',
      color: 'blue',
    },
    tabs: [
      {
        url: 'https://www.figma.com/file/launch-hero-mockups',
        title: 'ヒーローのモックアップ — Figma',
        note: 'トップページのバナーはバリアントBを使用。最終承認は金曜日。',
      },
      {
        url: 'https://docs.google.com/document/d/launch-checklist',
        title: 'ローンチ チェックリスト（Google Docs）',
        note: '料金ページの法務レビュー待ちでブロック中 — Dana に連絡。',
      },
      {
        url: 'https://www.notion.so/Press-Kit-and-Messaging',
        title: 'プレスキットとメッセージ — Notion',
        note: 'エンバーゴ解除はローンチ当日の9時（ET）。T-2 でプレスリストへ送付。',
      },
      {
        url: 'https://app.mixpanel.com/dashboard/activation-funnel',
        title: 'アクティベーション ファネル — Mixpanel',
        note: '初日のアクティベーションを監視。登録→アクティベーションが40%を下回ったら通知。',
      },
      {
        url: 'https://github.com/acme/launch-site/pull/482',
        title: 'PR #482: 料金ページのリデザイン',
        note: 'ステージングへデプロイする前に、あと1件の承認が必要。',
      },
      {
        url: 'https://calendly.com/acme-launch/go-no-go',
        title: 'Go / No-Go レビュー — Calendly',
        note: '経営陣の Go/No-Go は木曜14時。メトリクスのダッシュボードを準備しておく。',
      },
    ],
    tasks: [
      {
        summary: 'ローンチ告知のブログ記事を執筆',
        status: 'active',
        priority: 'high',
        notes: '初稿は水曜までに広報チームへレビュー依頼。',
      },
      {
        summary: '料金ページの文言を確定',
        status: 'active',
        priority: 'high',
        notes: '法務の承認待ち — デプロイ前の最後のブロッカー。',
      },
      {
        summary: '新しいオンボーディング フローを QA',
        status: 'open',
        priority: 'medium',
        notes: 'モバイル Safari と招待リンクのエッジケースをカバー。',
      },
      {
        summary: 'SNS のティーザーを予約投稿',
        status: 'open',
        priority: 'low',
        notes: 'ローンチ前の一週間で3本のティーザーを配信。',
      },
      {
        summary: 'アクティベーション ファネルのダッシュボードを構築',
        status: 'fixed',
        priority: 'medium',
        notes: 'Mixpanel で公開済み。リーダーシップのチャンネルで共有。',
      },
      {
        summary: '新機能についてサポートチームに説明',
        status: 'fixed',
        priority: 'high',
        notes: 'ウォークスルー完了。FAQ とマクロを公開。',
      },
      {
        summary: '有料リターゲティング広告を実施',
        status: 'abandoned',
        priority: 'low',
        notes: '今四半期はスコープ外に — Q4 の施策で再検討。',
      },
    ],
    rule: {
      name: 'タブをドメインごとにグループ化',
      description: '同じドメインのタブが2つ以上あれば自動でグループ化し、タブバーを整然と保ちます。',
    },
  },

  ko: {
    collection: {
      name: 'Q3 제품 출시',
      description: '9월 출시를 위한 모든 것 — 에셋, 사양, 고투마켓.',
      icon: '🚀',
      color: '#667eea',
      tags: ['출시', 'q3', '우선순위'],
    },
    folder: {
      name: '출시 에셋',
      color: 'blue',
    },
    tabs: [
      {
        url: 'https://www.figma.com/file/launch-hero-mockups',
        title: '히어로 목업 — Figma',
        note: '홈페이지 배너에는 변형 B 사용. 최종 승인은 금요일.',
      },
      {
        url: 'https://docs.google.com/document/d/launch-checklist',
        title: '출시 체크리스트 (Google Docs)',
        note: '가격 페이지 법무 검토 대기로 막힘 — Dana에게 연락.',
      },
      {
        url: 'https://www.notion.so/Press-Kit-and-Messaging',
        title: '프레스 키트 & 메시징 — Notion',
        note: '엠바고 해제는 출시 당일 오전 9시(ET). T-2에 언론 리스트로 발송.',
      },
      {
        url: 'https://app.mixpanel.com/dashboard/activation-funnel',
        title: '활성화 퍼널 — Mixpanel',
        note: '첫날 활성화 모니터링. 가입→활성화가 40% 아래로 떨어지면 알림.',
      },
      {
        url: 'https://github.com/acme/launch-site/pull/482',
        title: 'PR #482: 가격 페이지 리디자인',
        note: '스테이징에 배포하려면 승인 한 건이 더 필요함.',
      },
      {
        url: 'https://calendly.com/acme-launch/go-no-go',
        title: 'Go / No-Go 리뷰 — Calendly',
        note: '경영진 Go/No-Go는 목요일 오후 2시. 지표 대시보드를 준비해 둘 것.',
      },
    ],
    tasks: [
      {
        summary: '출시 공지 블로그 글 초안 작성',
        status: 'active',
        priority: 'high',
        notes: '초안은 수요일까지 커뮤니케이션 팀에 검토 요청.',
      },
      {
        summary: '가격 페이지 문구 확정',
        status: 'active',
        priority: 'high',
        notes: '법무 승인 대기 중 — 배포 전 마지막 블로커.',
      },
      {
        summary: '새 온보딩 플로우 QA',
        status: 'open',
        priority: 'medium',
        notes: '모바일 Safari와 초대 링크 엣지 케이스를 커버.',
      },
      {
        summary: '소셜 미디어 티저 예약',
        status: 'open',
        priority: 'low',
        notes: '출시 전 한 주 동안 티저 3개 배포.',
      },
      {
        summary: '활성화 퍼널 대시보드 구성',
        status: 'fixed',
        priority: 'medium',
        notes: 'Mixpanel에 라이브; 리더십 채널에 공유함.',
      },
      {
        summary: '새 기능에 대해 지원팀 브리핑',
        status: 'fixed',
        priority: 'high',
        notes: '워크스루 완료; FAQ와 매크로 게시함.',
      },
      {
        summary: '유료 리타게팅 캠페인 진행',
        status: 'abandoned',
        priority: 'low',
        notes: '이번 분기 범위에서 제외 — Q4 푸시 때 재검토.',
      },
    ],
    rule: {
      name: '도메인별로 탭 그룹화',
      description: '같은 도메인의 탭이 2개 이상이면 자동으로 그룹화하여 탭 바를 깔끔하게 유지합니다.',
    },
  },

  pt_BR: {
    collection: {
      name: 'Lançamento de produto Q3',
      description: 'Tudo para o lançamento de setembro — assets, specs e go-to-market.',
      icon: '🚀',
      color: '#667eea',
      tags: ['lançamento', 'q3', 'prioridade'],
    },
    folder: {
      name: 'Assets do lançamento',
      color: 'blue',
    },
    tabs: [
      {
        url: 'https://www.figma.com/file/launch-hero-mockups',
        title: 'Mockups do hero — Figma',
        note: 'Usar a variante B no banner da página inicial. Aprovação final na sexta.',
      },
      {
        url: 'https://docs.google.com/document/d/launch-checklist',
        title: 'Checklist de lançamento (Google Docs)',
        note: 'Bloqueado pela revisão jurídica da página de preços — avisar a Dana.',
      },
      {
        url: 'https://www.notion.so/Press-Kit-and-Messaging',
        title: 'Press kit e mensagens — Notion',
        note: 'Embargo cai às 9h (ET) no dia do lançamento. Enviar à imprensa em T-2.',
      },
      {
        url: 'https://app.mixpanel.com/dashboard/activation-funnel',
        title: 'Funil de ativação — Mixpanel',
        note: 'Monitorar a ativação do dia 1; alertar se cadastro→ativação cair abaixo de 40%.',
      },
      {
        url: 'https://github.com/acme/launch-site/pull/482',
        title: 'PR #482: Redesign da página de preços',
        note: 'Precisa de mais uma aprovação antes de implantar no staging.',
      },
      {
        url: 'https://calendly.com/acme-launch/go-no-go',
        title: 'Revisão Go / No-Go — Calendly',
        note: 'Go/no-go executivo é quinta às 14h. Ter o dashboard de métricas pronto.',
      },
    ],
    tasks: [
      {
        summary: 'Escrever o post de anúncio do lançamento',
        status: 'active',
        priority: 'high',
        notes: 'Primeiro rascunho para a equipe de comunicação até quarta, para revisão.',
      },
      {
        summary: 'Finalizar o texto da página de preços',
        status: 'active',
        priority: 'high',
        notes: 'Aguardando aprovação jurídica — último bloqueio antes do deploy.',
      },
      {
        summary: 'Fazer QA do novo fluxo de onboarding',
        status: 'open',
        priority: 'medium',
        notes: 'Cobrir o Safari mobile e o caso de borda do link de convite.',
      },
      {
        summary: 'Agendar os teasers nas redes sociais',
        status: 'open',
        priority: 'low',
        notes: 'Três teasers ao longo da semana que antecede o lançamento.',
      },
      {
        summary: 'Montar o dashboard do funil de ativação',
        status: 'fixed',
        priority: 'medium',
        notes: 'No ar no Mixpanel; compartilhado com o canal da liderança.',
      },
      {
        summary: 'Orientar o time de suporte sobre os novos recursos',
        status: 'fixed',
        priority: 'high',
        notes: 'Walkthrough feito; FAQ e macros publicados.',
      },
      {
        summary: 'Rodar campanha paga de retargeting',
        status: 'abandoned',
        priority: 'low',
        notes: 'Fora do escopo neste trimestre — revisitar no push do Q4.',
      },
    ],
    rule: {
      name: 'Agrupar abas por domínio',
      description: 'Quando 2+ abas compartilham um domínio, agrupá-las automaticamente para manter a barra organizada.',
    },
  },
};

export const LOCALES = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt_BR'];

/** Returns curated content for a locale, falling back to English. */
export function getContent(locale) {
  return CONTENT[locale] || CONTENT.en;
}
