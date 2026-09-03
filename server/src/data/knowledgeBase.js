/**
 * Curated fitness knowledge base for the RAG chatbot.
 *
 * This is the ONLY source the chatbot may answer from. If retrieval finds
 * nothing relevant here, the assistant says so rather than improvising — that
 * is the grounding contract, and it is what makes "the chatbot cannot
 * hallucinate a supplement protocol" a structural property rather than a hope.
 *
 * Content is written to reflect mainstream evidence-based practice (ISSN
 * position stands, ACSM guidance, and well-replicated meta-analyses). It is
 * general education, NOT medical advice, and every entry is deliberately
 * conservative where the evidence is mixed.
 *
 * Each entry carries:
 *   id        stable slug, used as a citation handle
 *   category  grouping shown in the UI
 *   title     short human label
 *   questions alternate phrasings — these are weighted double during retrieval,
 *             because a user's wording usually matches a question, not prose
 *   answer    the text the model is allowed to ground on
 *   tags      extra retrieval terms (jargon, abbreviations, brand-neutral names)
 */

export const knowledgeBase = [
  /* ------------------------------------------------------------ supplements */
  {
    id: 'creatine-basics',
    category: 'supplements',
    title: 'Creatine monohydrate',
    questions: [
      'Should I take creatine?',
      'How much creatine per day?',
      'Is creatine safe?',
      'What does creatine do?',
    ],
    tags: ['creatine', 'monohydrate', 'loading phase', 'supplement', 'strength'],
    answer:
      'Creatine monohydrate is the most researched sports supplement available and one of the few with consistently positive results. It increases phosphocreatine stores in muscle, which improves performance in short, high-effort work — typically a few extra reps or a small load increase over weeks. A standard dose is 3–5 g per day, taken at any time; timing does not matter much. A loading phase (20 g/day for 5–7 days) saturates stores faster but is optional, and plain daily dosing reaches the same place in three to four weeks. Monohydrate is the form with the evidence behind it; more expensive forms have not been shown to work better. Expect 1–2 kg of early weight gain from increased intramuscular water, which is not fat. It is well tolerated in healthy people; anyone with existing kidney disease should speak to a doctor first.',
  },
  {
    id: 'protein-requirements',
    category: 'nutrition',
    title: 'Daily protein requirements',
    questions: [
      'How much protein do I need?',
      'How much protein to build muscle?',
      'Is too much protein bad?',
    ],
    tags: ['protein', 'grams per kilo', 'muscle building', 'macros'],
    answer:
      'For people training to build or retain muscle, 1.6–2.2 g of protein per kg of bodyweight per day covers the useful range. Meta-analysis suggests benefits largely plateau around 1.6 g/kg, so the higher end is insurance rather than necessity. In a calorie deficit the higher end is more valuable, because adequate protein is the main dietary lever protecting lean mass while you lose fat. Spreading intake across 3–5 meals of roughly 0.4 g/kg each is a practical way to hit the total. There is no evidence that intakes in this range harm kidney function in healthy people.',
  },
  {
    id: 'protein-timing',
    category: 'nutrition',
    title: 'Protein timing and the anabolic window',
    questions: [
      'When should I drink my protein shake?',
      'Do I need protein right after training?',
      'Is the anabolic window real?',
    ],
    tags: ['anabolic window', 'post workout', 'protein shake', 'timing', 'whey'],
    answer:
      'Total daily protein matters far more than timing. The idea of a narrow 30-minute "anabolic window" has not held up: muscle protein synthesis stays elevated for many hours after training, and studies matching daily protein show little advantage to precise timing. A shake straight after training is convenient, not magic. What does help is not going very long stretches without protein — aiming for a serving every 3–5 hours across the day is more useful than obsessing over the minutes after your last set. If you train fasted, having protein reasonably soon afterwards is sensible.',
  },
  {
    id: 'whey-vs-food',
    category: 'supplements',
    title: 'Whey protein versus whole food',
    questions: [
      'Do I need whey protein?',
      'Is whey better than food?',
      'Which protein powder should I use?',
    ],
    tags: ['whey', 'isolate', 'concentrate', 'casein', 'protein powder', 'plant protein'],
    answer:
      'Protein powder is a convenience, not a requirement. If you can hit your daily protein target from food, you do not need it. Whey is digested quickly and is high in leucine, which makes it a practical post-training option; casein digests slowly and is sometimes used before bed, though the practical difference over a day is small. Isolate contains less lactose than concentrate, which helps if dairy upsets you. Plant blends (pea plus rice) work fine provided the total protein is adequate — combining sources covers the amino acid profile. Choose on cost, tolerance and taste.',
  },
  {
    id: 'caffeine-preworkout',
    category: 'supplements',
    title: 'Caffeine and pre-workout',
    questions: [
      'Should I take pre-workout?',
      'How much caffeine before the gym?',
      'Does caffeine improve performance?',
    ],
    tags: ['caffeine', 'pre workout', 'preworkout', 'stimulant', 'energy'],
    answer:
      'Caffeine is one of the few reliably performance-enhancing supplements. Roughly 3–6 mg per kg of bodyweight, taken 30–60 minutes before training, improves perceived effort, endurance and to a smaller degree strength. For an 80 kg person that is around 240–480 mg — a large dose at the top end, so start low. Tolerance builds with daily use, so some people cycle it or reserve it for hard sessions. Avoid it within about 8 hours of bedtime; the sleep cost will outweigh the training benefit. Most commercial pre-workouts are mainly caffeine plus ingredients with weaker evidence, so plain caffeine is often the cheaper equivalent.',
  },
  {
    id: 'bcaa-eaa',
    category: 'supplements',
    title: 'BCAAs and EAAs',
    questions: [
      'Do I need BCAAs?',
      'Are BCAAs worth it?',
      'BCAA vs EAA',
    ],
    tags: ['bcaa', 'eaa', 'branched chain amino acids', 'intra workout'],
    answer:
      'If your daily protein intake is adequate, BCAAs add little. Branched-chain amino acids are only three of the nine essential amino acids, and muscle protein synthesis needs all nine — so BCAAs alone cannot drive it well. Whole protein sources and complete protein powders already contain them in larger amounts than a typical BCAA serving. EAAs are more complete and have a somewhat better case, but still mainly for people struggling to eat enough protein. For most trainees this is money better spent on food.',
  },
  {
    id: 'other-supplements',
    category: 'supplements',
    title: 'Beta-alanine, citrulline, fish oil and vitamin D',
    questions: [
      'What supplements actually work?',
      'Is beta alanine worth taking?',
      'Should I take fish oil or vitamin D?',
    ],
    tags: ['beta alanine', 'citrulline', 'fish oil', 'omega 3', 'vitamin d', 'multivitamin'],
    answer:
      'Beyond creatine and caffeine, the evidence thins out quickly. Beta-alanine (3–5 g/day) has reasonable support for high-rep sets and efforts lasting 1–4 minutes; it causes harmless tingling. Citrulline malate has modest evidence for training volume. Fish oil and vitamin D are best thought of as filling dietary gaps rather than as performance aids — vitamin D matters if you get little sun exposure, and a blood test is more useful than guessing. A multivitamin is cheap insurance against a narrow diet but does not improve training on its own. Nothing here approaches the effect of consistent training, adequate protein and sleep.',
  },

  /* ---------------------------------------------------------------- recovery */
  {
    id: 'sleep-recovery',
    category: 'recovery',
    title: 'Sleep and recovery',
    questions: [
      'How much sleep do I need to build muscle?',
      'Does sleep affect gains?',
      'Why am I not recovering?',
    ],
    tags: ['sleep', 'recovery', 'rest', 'fatigue', 'overtraining'],
    answer:
      'Sleep is the highest-leverage recovery variable and the one most often neglected. Aim for 7–9 hours. Restricting sleep to around 5 hours has been shown to reduce strength performance, raise perceived effort, impair glucose handling and — in a calorie deficit — shift weight loss towards lean mass rather than fat. If you are training hard and progressing poorly, sleep is worth auditing before supplements or programme changes. Consistent timing, a dark cool room, and keeping caffeine at least 8 hours from bedtime do more than any recovery product.',
  },
  {
    id: 'doms-soreness',
    category: 'recovery',
    title: 'Muscle soreness (DOMS)',
    questions: [
      'Why am I so sore after training?',
      'Is soreness a sign of a good workout?',
      'Should I train when sore?',
      'What is DOMS?',
    ],
    tags: ['doms', 'soreness', 'sore muscles', 'delayed onset'],
    answer:
      'Delayed onset muscle soreness typically appears 12–24 hours after training, peaks around 24–72 hours, and fades within a few days. It is caused mainly by unfamiliar or lengthened-position work rather than by lactic acid. Soreness is not a measure of a session\'s quality: you can grow well with little soreness, and be very sore from a session that built nothing. It also reduces sharply as you repeat a movement. Training a mildly sore muscle is generally fine and often eases the sensation; training through sharp, joint-centred or one-sided pain is not. Light movement, adequate protein and sleep help more than stretching does.',
  },
  {
    id: 'rest-days',
    category: 'recovery',
    title: 'Rest days and training frequency',
    questions: [
      'How many rest days do I need?',
      'Can I train every day?',
      'How often should I train each muscle?',
    ],
    tags: ['rest day', 'frequency', 'recovery', 'split', 'overtraining'],
    answer:
      'Muscle protein synthesis stays elevated for roughly 24–48 hours after training a muscle, which is why training each muscle about twice a week tends to outperform once a week at matched weekly volume. That is the reasoning behind upper/lower and push/pull/legs splits run twice over. Training on consecutive days is fine as long as you are not hammering the same muscles; most people do well with 1–3 full rest days a week. Signals you need more rest include performance dropping across sessions, persistent joint ache, poor sleep and lost motivation — which is a cue to deload rather than push harder.',
  },
  {
    id: 'deload',
    category: 'recovery',
    title: 'Deloads',
    questions: [
      'What is a deload?',
      'When should I deload?',
      'How do I deload?',
    ],
    tags: ['deload', 'plateau', 'stall', 'fatigue', 'taper'],
    answer:
      'A deload is a planned easy week that lets accumulated fatigue clear so performance can rebound. Common triggers are a stall in performance across two or three sessions, joint niggles, or simply having trained hard for 4–8 weeks. The usual approach is to keep the same exercises but cut volume (roughly half the sets) or load (around 10–20% lighter), for one week. Cutting volume while keeping some load tends to preserve skill and strength better than resting completely. FitGen\'s progression engine applies the same idea automatically: if you fall below your rep range on two consecutive sessions, it suggests roughly 10% less load rather than letting you grind.',
  },
  {
    id: 'stretching-warmup',
    category: 'recovery',
    title: 'Stretching and warming up',
    questions: [
      'Should I stretch before lifting?',
      'Should I stretch before lifting weights?',
      'How should I warm up before a workout?',
      'Does stretching prevent injury?',
      'Is static stretching bad before training?',
    ],
    tags: [
      'stretching',
      'stretch',
      'warm up',
      'warmup',
      'mobility',
      'static stretching',
      'dynamic',
      'before lifting',
    ],
    answer:
      'Long static stretches immediately before heavy lifting can temporarily reduce force output, so they are a poor choice as a warm-up. A better sequence is 5–10 minutes of light general movement to raise temperature, some dynamic mobility for the joints you are about to load, then two or three progressively heavier warm-up sets of the first exercise. Static stretching is fine and useful for flexibility goals — just place it after training or in a separate session. The evidence that stretching prevents injury is weak; a sensible warm-up, controlled technique and appropriate load progression matter more.',
  },

  /* -------------------------------------------------------------------- form */
  {
    id: 'squat-form',
    category: 'form',
    title: 'Squat technique',
    questions: [
      'How do I squat properly?',
      'How deep should I squat?',
      'Are knees over toes bad in a squat?',
      'Why do my knees cave in when I squat?',
    ],
    tags: ['squat', 'back squat', 'depth', 'knees', 'form', 'technique', 'legs'],
    answer:
      'Set the bar evenly across the upper back, grip firmly, and brace your midsection as if about to be pushed. Take a stance around shoulder width with feet turned out slightly to suit your hips. Descend by allowing the hips and knees to bend together, keeping the whole foot in contact with the floor and the knees tracking roughly over the toes. Knees travelling past the toes is normal and not inherently harmful — how far depends on your limb proportions. Aim for the depth you can reach while keeping a neutral spine; for most people that is around parallel or slightly below, and forcing more depth than your hips allow causes the lower back to round. If your knees collapse inward under load, the load is usually too heavy for current control — reduce it, and cue pushing the knees out against the floor.',
  },
  {
    id: 'deadlift-form',
    category: 'form',
    title: 'Deadlift technique',
    questions: [
      'How do I deadlift safely?',
      'Why does my lower back hurt after deadlifts?',
      'Should my back be straight when deadlifting?',
    ],
    tags: ['deadlift', 'hinge', 'lower back', 'form', 'technique', 'hamstrings'],
    answer:
      'Stand with the bar over mid-foot, roughly hip-width stance. Hinge at the hips to reach the bar, keeping the spine neutral rather than rounded or heavily arched. Before pulling, take the slack out of the bar and brace hard; the chest should be up and the shoulders roughly over or slightly ahead of the bar. Push the floor away and keep the bar travelling close to your legs — a bar that drifts forward multiplies the load on your lower back. Finish by standing tall without leaning back. Lower-back soreness after deadlifts is common when the bar drifts, when the hips rise before the bar leaves the floor, or simply when volume jumps too fast. Sharp or persistent back pain is a reason to stop and get it assessed, not to push on.',
  },
  {
    id: 'bench-form',
    category: 'form',
    title: 'Bench press technique',
    questions: [
      'How do I bench press correctly?',
      'Why do my shoulders hurt when benching?',
      'Should I arch my back on bench press?',
    ],
    tags: ['bench press', 'bench', 'chest', 'shoulders', 'form', 'technique', 'press'],
    answer:
      'Set your shoulder blades back and down into the bench and keep them there — that stable base is what protects the shoulder joint. Grip a little wider than shoulder width, keep the wrists stacked over the elbows, and plant your feet. Lower the bar under control to the lower chest with the elbows tucked to roughly 45–75 degrees from the torso rather than flared straight out to the sides, which is a common cause of front-shoulder pain. A modest arch through the upper back is normal and helps keep the shoulders safe; an extreme arch is a powerlifting technique for moving maximum load and is not necessary otherwise. Use a spotter or safety pins when working close to failure.',
  },
  {
    id: 'row-pulldown-form',
    category: 'form',
    title: 'Rows and pulldowns',
    questions: [
      'How do I row properly?',
      'Am I using my back or my arms?',
      'How do I do lat pulldowns?',
    ],
    tags: ['row', 'barbell row', 'pulldown', 'lats', 'back', 'form', 'technique', 'pull'],
    answer:
      'For rows, set a stable torso position and initiate the movement by driving the elbows back rather than by curling with the arms — think of the hands as hooks. Pull towards the lower ribs or navel for lat emphasis, or higher towards the sternum for more mid-back and rear delt. Let the shoulder blades move: retract as you pull, allow them to travel forward as you lower. For pulldowns, keep the torso close to upright with only slight lean, pull the bar to the upper chest, and avoid using body swing to move the weight. If you mostly feel your biceps, the load is usually too heavy or the range too short — lighten it and slow the lowering phase.',
  },
  {
    id: 'overhead-press-form',
    category: 'form',
    title: 'Overhead press technique',
    questions: [
      'How do I overhead press?',
      'Is overhead pressing bad for shoulders?',
      'Why can I not press overhead without leaning back?',
    ],
    tags: ['overhead press', 'shoulder press', 'ohp', 'shoulders', 'form', 'technique'],
    answer:
      'Start with the bar on the front of the shoulders, elbows slightly ahead of the bar, and the midsection braced with the ribs down rather than flared. Press up and slightly back so the bar finishes over the middle of your head, and move your head out of the way rather than pushing the bar around it. Squeeze the glutes to stop the lower back arching — excessive layback usually means the load is too heavy or thoracic mobility is limiting you. Overhead pressing is not inherently bad for shoulders; pressing with poor scapular control, or through pain, is. If overhead range is uncomfortable, a landmine or high-incline press are reasonable substitutes while you work on mobility.',
  },
  {
    id: 'range-of-motion-tempo',
    category: 'form',
    title: 'Range of motion and tempo',
    questions: [
      'Should I use full range of motion?',
      'How fast should I lift?',
      'How fast should I lower the weight?',
      'How slow should the eccentric be?',
      'Are partial reps useful?',
    ],
    tags: [
      'range of motion',
      'tempo',
      'eccentric',
      'lowering',
      'lower the weight',
      'partial reps',
      'lengthened',
      'controlled',
    ],
    answer:
      'Training through a full range you can control generally produces more growth than short partial reps, and work in the lengthened (stretched) portion of a movement appears particularly effective. Control the lowering phase — around 2 seconds is a reasonable default — and lift with intent on the way up. Extremely slow lifting reduces the load you can use without a clear benefit, and bouncing out of the bottom removes tension from exactly the position that drives adaptation. Partial reps at the end of a set, once full reps fail, can add useful volume but are a supplement to full-range work rather than a replacement.',
  },

  /* ----------------------------------------------------- progressive overload */
  {
    id: 'progressive-overload',
    category: 'training',
    title: 'Progressive overload',
    questions: [
      'What is progressive overload?',
      'How do I keep making progress?',
      'How do I know when to add weight?',
    ],
    tags: ['progressive overload', 'progression', 'add weight', 'double progression'],
    answer:
      'Progressive overload means gradually increasing the demand you place on a muscle over time. Adding weight is only one route — you can also add reps, add sets, improve control or range, shorten rest, or perform the same work with better technique. A practical method is double progression: work up the rep range at a fixed load, and when you hit the top of the range on every set, add the smallest useful increment and drop back to the bottom of the range. For upper-body isolation that increment might be 1–2.5 kg; for lower-body compounds, 5 kg. Progress is not linear forever — the closer you get to your ceiling, the slower it becomes, which is normal rather than a sign something is wrong.',
  },
  {
    id: 'plateau-breaking',
    category: 'training',
    title: 'Breaking a plateau',
    questions: [
      'I stopped making progress, what do I do?',
      'How do I break a plateau?',
      'Why am I stuck at the same weight?',
    ],
    tags: ['plateau', 'stall', 'stuck', 'no progress', 'stagnation'],
    answer:
      'First check the inputs before changing the programme: are you sleeping enough, eating enough protein, eating enough total calories, and actually training close to hard? A genuine plateau after those are in order usually responds to one of a few things. A deload week lets fatigue clear so the same load feels lighter. Changing rep range shifts the stimulus — if you have been at 8–12 for months, a block at 5–8 or 12–15 often restarts progress. Adding a set or two per muscle per week increases volume. Swapping to a close variation of a stuck lift can also work. Change one variable at a time so you can tell what helped.',
  },
  {
    id: 'training-volume',
    category: 'training',
    title: 'How much volume you need',
    questions: [
      'How many sets per muscle per week?',
      'How much volume do I need to grow?',
      'Is more volume always better?',
    ],
    tags: ['volume', 'sets per week', 'hypertrophy', 'junk volume'],
    answer:
      'Roughly 10–20 hard sets per muscle per week suits most trainees for growth, with beginners doing well at the lower end and more advanced lifters often needing more. Volume and results are related but not linearly: beyond a point, added sets recover more slowly than they contribute, and the extra work becomes a recovery cost rather than a stimulus. Rather than chasing a number, add volume gradually and watch whether your performance is still improving. Two sessions per muscle per week is a convenient way to distribute the total without any single session becoming excessively long.',
  },
  {
    id: 'training-to-failure',
    category: 'training',
    title: 'Training to failure and RIR',
    questions: [
      'Should I train to failure?',
      'What is RIR?',
      'How hard should each set be?',
    ],
    tags: ['failure', 'rir', 'reps in reserve', 'rpe', 'intensity', 'effort'],
    answer:
      'Sets need to be genuinely hard to drive growth, but they do not all need to reach failure. Stopping 1–3 reps short — described as 1–3 reps in reserve, or RIR — appears to produce similar growth to training to failure while accumulating much less fatigue, which lets you do more quality work across the week. Failure is more useful on isolation and machine work, where the fatigue cost is lower and judging proximity to failure is harder, and less useful on heavy compounds where technique degrades and the recovery cost is high. If you consistently finish sets feeling you had 5 or more reps left, that is the more common problem.',
  },
  {
    id: 'rest-between-sets',
    category: 'training',
    title: 'Rest between sets',
    questions: [
      'How long should I rest between sets?',
      'Does short rest build more muscle?',
    ],
    tags: ['rest', 'rest periods', 'between sets', 'recovery time'],
    answer:
      'Longer rest generally lets you keep more reps at a given load, and since total hard work drives growth, that matters. For heavy compound lifts, 2–3 minutes is a reasonable default; going to 3–5 minutes on very heavy sets is fine. For isolation work, 1–2 minutes is usually enough. Very short rest periods raise the metabolic feel of a session but reduce performance on later sets, and studies comparing matched programmes tend to favour longer rest for both strength and size. If time is limited, pairing exercises for unrelated muscles lets you rest one while working the other.',
  },
  {
    id: 'cardio-interference',
    category: 'training',
    title: 'Cardio alongside lifting',
    questions: [
      'Will cardio kill my gains?',
      'Should I do cardio while building muscle?',
      'When should I do cardio?',
    ],
    tags: ['cardio', 'interference effect', 'running', 'conditioning', 'concurrent'],
    answer:
      'Moderate cardio does not meaningfully interfere with muscle growth and improves work capacity, recovery and health. The interference effect is real but mostly shows up with high volumes of intense endurance work in the same muscles you are trying to grow — long hard running alongside heavy leg training being the classic case. Practical steps: separate cardio and lifting by a few hours where possible, put cardio after lifting rather than before if they share a session, and favour lower-impact modes such as cycling or incline walking if leg recovery is the limit. For fat loss, daily step count usually contributes more than dedicated cardio sessions.',
  },

  /* --------------------------------------------------------- fat loss / bulk */
  {
    id: 'fat-loss-rate',
    category: 'nutrition',
    title: 'How fast to lose fat',
    questions: [
      'How fast should I lose weight?',
      'How big should my calorie deficit be?',
      'Why am I losing strength while cutting?',
    ],
    tags: ['fat loss', 'cutting', 'deficit', 'weight loss rate', 'diet'],
    answer:
      'Losing roughly 0.5–1% of bodyweight per week keeps fat loss reasonably fast while limiting muscle loss — for an 80 kg person that is about 0.4–0.8 kg a week. That usually corresponds to a 15–25% calorie deficit. Larger deficits accelerate scale weight loss but increase lean mass loss, worsen training performance and are harder to sustain. Losing some strength in a deficit is normal, especially deep into one; keeping protein high, keeping training intensity up while accepting slightly less volume, and taking planned maintenance breaks all help. Weight also fluctuates day to day from water and food volume, so judge progress on a weekly average rather than single readings.',
  },
  {
    id: 'lean-bulk',
    category: 'nutrition',
    title: 'Gaining muscle without excess fat',
    questions: [
      'How do I lean bulk?',
      'How much should I eat to build muscle?',
      'Do I need a big surplus to grow?',
    ],
    tags: ['bulking', 'lean bulk', 'surplus', 'muscle gain', 'weight gain'],
    answer:
      'Muscle gain needs a modest surplus, not a large one. Around 10–15% above maintenance, producing roughly 0.25–0.5% of bodyweight gained per week, gives the body what it needs while limiting fat gain. Beginners can gain faster; the more trained you are, the slower muscle accrues and the more a large surplus simply adds fat. If your weight is not moving over two to three weeks, add a small amount of food rather than doubling intake. Track a weekly weight average alongside training performance — if the scale is climbing but lifts are not, most of the gain is not muscle.',
  },
  {
    id: 'recomp',
    category: 'nutrition',
    title: 'Body recomposition',
    questions: [
      'Can I build muscle and lose fat at the same time?',
      'What is body recomposition?',
    ],
    tags: ['recomp', 'recomposition', 'lose fat gain muscle', 'body composition'],
    answer:
      'Building muscle while losing fat is possible, and most likely in beginners, people returning after a break, and those carrying more body fat. It happens more slowly than either goal pursued alone, so scale weight may barely move while your measurements and lifts improve — which is why photos, tape measurements and gym performance are better feedback than weight alone. The usual setup is calories at or slightly below maintenance, protein at the higher end of the range, and consistent resistance training with clear progressive overload. For advanced lifters at low body fat, dedicated phases usually work better.',
  },
  {
    id: 'diet-breaks',
    category: 'nutrition',
    title: 'Diet breaks and refeeds',
    questions: [
      'Should I take a diet break?',
      'What is a refeed day?',
      'I have been dieting for months, what now?',
    ],
    tags: ['diet break', 'refeed', 'maintenance phase', 'metabolic adaptation'],
    answer:
      'Extended dieting brings adaptations that make continuing harder: hunger rises, spontaneous movement falls, and training performance dips. Planned breaks at maintenance calories — typically one to two weeks after 8–12 weeks of deficit — can restore performance and adherence without undoing progress, and evidence suggests fat loss over the whole period is similar or better than dieting straight through. Shorter refeeds, where carbohydrates are raised for a day or two, mainly help with training quality and psychological relief. Neither is required, but both are useful tools if adherence is slipping.',
  },
  {
    id: 'hydration',
    category: 'nutrition',
    title: 'Hydration',
    questions: ['How much water should I drink?', 'Does dehydration affect training?'],
    tags: ['water', 'hydration', 'dehydration', 'fluid'],
    answer:
      'A common practical target is around 30–40 ml of fluid per kg of bodyweight per day, adjusted up for hot weather and heavy sweating. Losing even 2% of bodyweight in fluid measurably reduces strength and endurance performance and raises perceived effort. Pale straw-coloured urine is a reasonable everyday indicator. All fluids count, including tea and coffee — the mild diuretic effect of caffeine does not offset the fluid it comes with. There is no benefit to forcing very large volumes beyond thirst and normal needs.',
  },
  {
    id: 'alcohol',
    category: 'nutrition',
    title: 'Alcohol and training',
    questions: ['Does alcohol affect muscle growth?', 'Can I drink and still make progress?'],
    tags: ['alcohol', 'drinking', 'beer', 'recovery'],
    answer:
      'Alcohol works against training on several fronts: it blunts muscle protein synthesis after a session, disrupts sleep quality even when total sleep time looks normal, contributes calories with no nutritional value, and impairs next-day performance. Occasional moderate drinking will not undo consistent training, but heavy drinking — particularly on training days or the night before a hard session — has a measurable cost. If you do drink, keeping it away from your hardest sessions, staying hydrated and still hitting your protein target limits the damage.',
  },

  /* ---------------------------------------------------------------- beginner */
  {
    id: 'beginner-start',
    category: 'training',
    title: 'Starting out',
    questions: [
      'I am a beginner, where do I start?',
      'How should a beginner train?',
      'What should my first programme look like?',
    ],
    tags: ['beginner', 'novice', 'start', 'first programme', 'newbie'],
    answer:
      'Start with 2–4 sessions a week covering the whole body, built around a handful of movement patterns rather than many exercises: a squat pattern, a hip hinge, an upper-body push, an upper-body pull, and some direct core work. Two to three sets of 8–12 reps per exercise is plenty at first. Prioritise learning technique with manageable loads, and add a small amount of weight or a rep whenever a session feels comfortably achievable — beginners can progress remarkably quickly this way. Consistency over months matters far more than programme choice, exercise selection or supplements. Full-body or upper/lower splits usually suit beginners better than specialised body-part days.',
  },
  {
    id: 'muscle-gain-rate',
    category: 'training',
    title: 'How fast you can build muscle',
    questions: [
      'How long does it take to build muscle?',
      'How much muscle can I gain in a month?',
      'When will I see results?',
    ],
    tags: ['muscle gain rate', 'expectations', 'timeline', 'results', 'newbie gains'],
    answer:
      'Realistic rates vary sharply with training age. A well-fed beginner training consistently might gain roughly 1–1.5% of bodyweight in muscle per month early on; by the second or third year that often halves, and advanced lifters may gain only a couple of kilograms a year. Strength improves faster than size at first, largely through neural adaptation, so expect your lifts to climb before the mirror changes. Visible change usually takes 8–12 weeks of consistent training, and photographs plus tape measurements will show it long before day-to-day mirror impressions do.',
  },
  {
    id: 'machines-vs-free-weights',
    category: 'training',
    title: 'Machines versus free weights',
    questions: [
      'Are free weights better than machines?',
      'Should I use machines?',
      'Can I build muscle with machines only?',
    ],
    tags: ['machines', 'free weights', 'barbell', 'dumbbell', 'cable', 'equipment'],
    answer:
      'For muscle growth, machines and free weights produce broadly similar results when effort and volume match. Machines are easier to learn, safer to take close to failure without a spotter, and useful for isolating a muscle or training around an injury. Free weights demand more stability and coordination, transfer better to loaded real-world tasks, and let you load heavy compound patterns. Neither is required — you can build a good physique with either, and most sensible programmes use both. If your gym is limited, that is a constraint on exercise selection, not on your results.',
  },
  {
    id: 'home-bodyweight',
    category: 'training',
    title: 'Training with minimal equipment',
    questions: [
      'Can I build muscle at home?',
      'How do I progress with bodyweight only?',
      'No gym, what can I do?',
    ],
    tags: ['home workout', 'bodyweight', 'no equipment', 'calisthenics', 'bands'],
    answer:
      'Bodyweight training builds muscle provided sets are taken close to failure and you keep finding ways to make movements harder. Since you cannot add plates, progress by adding reps, slowing the lowering phase, pausing at the hardest position, reducing leverage (feet elevated push-ups, then single-arm progressions), or moving to harder variations such as pistol squats and pull-ups. Resistance bands add cheap load, and a single adjustable dumbbell or kettlebell widens the options considerably. The main limitation is heavy lower-body work, where bodyweight eventually becomes too light — single-leg variations are the usual answer.',
  },
  {
    id: 'spot-reduction',
    category: 'nutrition',
    title: 'Targeted fat loss',
    questions: [
      'How do I lose belly fat?',
      'Can I target fat loss in one area?',
      'What exercises burn belly fat?',
    ],
    tags: ['spot reduction', 'belly fat', 'abs', 'targeted fat loss', 'love handles'],
    answer:
      'You cannot choose where fat comes off. Training a muscle does not preferentially burn the fat sitting over it — endless crunches will develop the abdominal muscles without removing the layer above them. Fat loss happens systemically in response to a calorie deficit, and where you lose from first is largely genetic, with the abdomen and hips often being last for many people. The effective approach is a moderate deficit, adequate protein, resistance training to retain muscle, and patience. Visible abdominal definition is mostly a function of overall body fat, not abdominal training volume.',
  },
  {
    id: 'toning-vs-bulking',
    category: 'training',
    title: '"Toning" and fear of getting bulky',
    questions: [
      'How do I tone without getting bulky?',
      'Will lifting heavy make me bulky?',
      'Should women lift light weights for toning?',
    ],
    tags: ['toning', 'bulky', 'women lifting', 'light weights', 'high reps'],
    answer:
      'What people usually mean by "toned" is a combination of some muscle and lower body fat — which is built by resistance training plus appropriate nutrition, not by using light weights for high reps. Light-and-high-rep work is not a separate mechanism; it is simply a less efficient way to reach a hard set. Building visible muscle mass is slow and requires deliberate effort, adequate calories and years of consistency, so it does not happen accidentally. Women generally build muscle at a similar relative rate to men but from a lower absolute base and with far less absolute mass, so training heavy is not a route to becoming unintentionally large.',
  },

  /* ------------------------------------------------------------------ safety */
  {
    id: 'pain-vs-discomfort',
    category: 'safety',
    title: 'Training pain versus injury',
    questions: [
      'Should I train through pain?',
      'How do I know if I am injured?',
      'What is the difference between soreness and injury?',
    ],
    tags: ['pain', 'injury', 'hurt', 'safety', 'joint pain'],
    answer:
      'Muscular discomfort during hard sets, and generalised soreness for a day or two afterwards, are normal. Warning signs that something is different include sharp or stabbing pain, pain located in a joint rather than a muscle, pain on only one side, swelling, pain that worsens through a session rather than easing, numbness or tingling, and pain that persists at rest or wakes you at night. Those warrant stopping the aggravating movement and getting assessed by a physiotherapist or doctor rather than working around them indefinitely. FitGen can route your plan away from areas you record as injured, but it cannot diagnose anything — that requires a professional.',
  },
  {
    id: 'when-to-see-professional',
    category: 'safety',
    title: 'When to see a professional',
    questions: [
      'Should I see a doctor before starting to train?',
      'When do I need a physiotherapist?',
    ],
    tags: ['doctor', 'physiotherapist', 'medical', 'clearance', 'safety'],
    answer:
      'Speak to a doctor before starting or substantially increasing training if you have a known heart condition, chest pain or shortness of breath on exertion, uncontrolled blood pressure, are pregnant, are managing a chronic condition such as diabetes or kidney disease, or are taking medication that affects heart rate, blood pressure or bone density. See a physiotherapist for pain that persists beyond a week or two, any injury that limits normal daily movement, or recurring pain in the same place. For disordered eating concerns, a doctor or registered dietitian is the right first contact. This application offers general education, not clinical guidance.',
  },
];

/** Category labels for the chat UI. */
export const KNOWLEDGE_CATEGORIES = {
  supplements: 'Supplements',
  nutrition: 'Nutrition',
  recovery: 'Recovery',
  form: 'Technique',
  training: 'Training',
  safety: 'Safety',
};

export default knowledgeBase;
