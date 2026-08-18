/**
 * The authoritative India curriculum data: CBSE Class 10/12, ICSE, ISC and the IB
 * Diploma Programme, down to topic level.
 *
 * Build-time only — nothing imports this at runtime. It is the single source for both
 * `src/lib/ai/specifications.json` (the client-side spec catalogue) and the SQL seed
 * migrations, so the two cannot drift. Regenerate with:
 *
 *   bun run scripts/generate-india-curriculum.ts
 *
 * Topic lists follow the current NCERT / CISCE / IBO subject guides. `tierTopics` adds
 * topics that only one tier studies (IB HL extensions); everything else is shared.
 */

export type SpecDef = {
  name: string;
  tiers?: string[];
  topics: string[];
  /** Extra topics for one tier only, keyed by the tier name as it appears in `tiers`. */
  tierTopics?: Record<string, string[]>;
};

export type SubjectDef = { subject: string; specs: SpecDef[] };

export type QualificationDef = {
  /** Must match a qualification id in src/lib/ai/qualifications.ts. */
  qualId: string;
  /** Must match that qualification's single board slug. */
  board: string;
  subjects: SubjectDef[];
};

/**
 * The cross-cutting, subject-level learning objectives. Copied verbatim from the UK
 * seed (migrations 20260704091500 onward) so a code means exactly the same thing in
 * both curricula — the objective text is what the generation prompts receive, and
 * `diagram_completion` / `graph_plotting` / `chart_construction_accuracy` are what
 * unlock the interactive diagram and plot question types.
 */
export const OBJECTIVE_CATALOGUE: Record<string, { objective: string; applies_to: string[] }> = {
  command_words: {
    objective:
      'Learn and apply exam command words (e.g. describe, explain, evaluate, calculate) correctly in every answer.',
    applies_to: ['notes', 'flashcards', 'exam_practice'],
  },
  key_terminology: {
    objective: 'Learn and correctly define key terminology for this subject.',
    applies_to: ['notes', 'flashcards', 'exam_practice'],
  },
  data_analysis: {
    objective:
      'Practise interpreting and calculating from graphs, tables, and data sets, then drawing valid conclusions.',
    applies_to: ['notes', 'exam_practice'],
  },
  extended_writing: {
    objective:
      'Practise structuring extended written answers (e.g. PEEL paragraphs, essay plans) to match the mark scheme.',
    applies_to: ['notes', 'exam_practice'],
  },
  diagrams_visual: {
    objective: 'Learn to draw, label, and interpret key diagrams and visual models.',
    applies_to: ['notes', 'flashcards'],
  },
  source_analysis: {
    objective:
      'Practise analysing and evaluating data, sources, or case studies to form a supported judgement.',
    applies_to: ['notes', 'exam_practice'],
  },
  problem_solving: {
    objective: 'Build problem-solving skills by applying methods to unfamiliar, multi-step questions.',
    applies_to: ['exam_practice'],
  },
  calculation_technique: {
    objective: 'Master step-by-step calculation methods and show full working for numeric questions.',
    applies_to: ['flashcards', 'exam_practice'],
  },
  practical_skills: {
    objective:
      'Build practical and investigative skills, including method, variables, and evaluating results.',
    applies_to: ['notes', 'exam_practice'],
  },
  case_studies: {
    objective: 'Learn named case studies and real-world examples, and apply them to exam scenarios.',
    applies_to: ['notes', 'flashcards', 'exam_practice'],
  },
  best_fit_judgement: {
    objective:
      'Practise judging whether a scatter graph needs a straight line or a curve of best fit, and drawing it accurately through the plotted points.',
    applies_to: ['notes', 'exam_practice'],
  },
  graph_plotting: {
    objective:
      'Practise plotting graphs from practical or experimental results, choosing sensible scales, plotting points accurately, and drawing a line or curve of best fit.',
    applies_to: ['notes', 'exam_practice'],
  },
  diagram_completion: {
    objective:
      'Complete unfinished diagrams by labelling the missing parts and drawing the missing connections (e.g. cell structures, apparatus, circuits, the carbon/water cycle, food webs and energy-transfer chains).',
    applies_to: ['exam_practice'],
  },
  language_analysis_writing: {
    objective:
      'Practise analysing unseen texts and crafting creative or transactional writing for purpose and audience.',
    applies_to: ['notes', 'flashcards', 'exam_practice'],
  },
  computational_thinking: {
    objective: 'Practise decomposing problems and tracing or writing algorithms and code.',
    applies_to: ['flashcards', 'exam_practice'],
  },
  close_reading: {
    objective: 'Analyse language, structure, and form in set texts, supporting points with quotations.',
    applies_to: ['notes', 'flashcards', 'exam_practice'],
  },
  chart_construction_accuracy: {
    objective:
      'Construct and plot pie charts, bar charts, line graphs, histograms (including unequal class widths), frequency polygons, stem-and-leaf diagrams, box plots, and scatter graphs accurately, using correct scales, correctly labelled axes, and a line or curve of best fit where the data requires it.',
    applies_to: ['notes', 'exam_practice'],
  },
};

const SCIENCE_OBJECTIVES = [
  'command_words',
  'key_terminology',
  'data_analysis',
  'diagrams_visual',
  'practical_skills',
  'graph_plotting',
  'diagram_completion',
];
const HUMANITIES_OBJECTIVES = ['command_words', 'key_terminology', 'extended_writing', 'source_analysis'];
const COMMERCE_OBJECTIVES = [
  'command_words',
  'key_terminology',
  'data_analysis',
  'extended_writing',
  'source_analysis',
  'case_studies',
  'calculation_technique',
];
const LANGUAGE_OBJECTIVES = ['key_terminology', 'extended_writing'];

/** Which objectives each subject gets. Keyed by the subject slug used above. */
export const SUBJECT_OBJECTIVES: Record<string, string[]> = {
  biology: [...SCIENCE_OBJECTIVES, 'best_fit_judgement'],
  chemistry: [...SCIENCE_OBJECTIVES, 'calculation_technique', 'problem_solving'],
  physics: [...SCIENCE_OBJECTIVES, 'calculation_technique', 'problem_solving'],
  science: SCIENCE_OBJECTIVES,
  mathematics: [
    'key_terminology',
    'data_analysis',
    'calculation_technique',
    'problem_solving',
    'best_fit_judgement',
    'chart_construction_accuracy',
  ],
  'english language': ['key_terminology', 'extended_writing', 'source_analysis', 'language_analysis_writing'],
  'english literature': ['key_terminology', 'extended_writing', 'close_reading'],
  history: HUMANITIES_OBJECTIVES,
  'history and civics': HUMANITIES_OBJECTIVES,
  'political science': HUMANITIES_OBJECTIVES,
  'global politics': [...HUMANITIES_OBJECTIVES, 'case_studies'],
  sociology: [...HUMANITIES_OBJECTIVES, 'case_studies'],
  'social science': [...HUMANITIES_OBJECTIVES, 'case_studies', 'data_analysis'],
  geography: [
    'command_words',
    'key_terminology',
    'data_analysis',
    'diagrams_visual',
    'extended_writing',
    'source_analysis',
    'case_studies',
    'practical_skills',
  ],
  economics: [...COMMERCE_OBJECTIVES, 'problem_solving'],
  business: [...COMMERCE_OBJECTIVES, 'diagrams_visual'],
  'business studies': [...COMMERCE_OBJECTIVES, 'diagrams_visual'],
  commerce: [...COMMERCE_OBJECTIVES, 'diagrams_visual'],
  'commercial studies': [...COMMERCE_OBJECTIVES, 'diagrams_visual'],
  accountancy: ['key_terminology', 'calculation_technique', 'problem_solving', 'data_analysis'],
  psychology: [
    'command_words',
    'key_terminology',
    'data_analysis',
    'extended_writing',
    'source_analysis',
    'case_studies',
  ],
  'computer science': [
    'command_words',
    'key_terminology',
    'computational_thinking',
    'problem_solving',
    'diagrams_visual',
  ],
  'computer applications': ['key_terminology', 'computational_thinking', 'problem_solving', 'diagrams_visual'],
  'information technology': ['key_terminology', 'computational_thinking', 'problem_solving'],
  'environmental science': [
    'command_words',
    'key_terminology',
    'data_analysis',
    'case_studies',
    'source_analysis',
    'practical_skills',
  ],
  'visual arts': ['key_terminology', 'extended_writing'],
  hindi: LANGUAGE_OBJECTIVES,
  sanskrit: LANGUAGE_OBJECTIVES,
  french: LANGUAGE_OBJECTIVES,
  spanish: LANGUAGE_OBJECTIVES,
  // Entrance-exam papers. These are speed-and-accuracy tests under a clock rather than
  // taught courses, so they lean on command words, close reading and technique rather
  // than the practical and extended-writing objectives a school subject carries.
  'english proficiency': ['key_terminology', 'close_reading', 'language_analysis_writing'],
  'logical reasoning': ['problem_solving', 'best_fit_judgement', 'data_analysis'],
  aptitude: ['problem_solving', 'data_analysis', 'calculation_technique', 'best_fit_judgement'],
  'legal reasoning': ['command_words', 'key_terminology', 'close_reading', 'source_analysis', 'case_studies'],
  'current affairs': ['key_terminology', 'source_analysis', 'close_reading'],
  'quantitative ability': ['calculation_technique', 'problem_solving', 'data_analysis'],
  'verbal ability': ['key_terminology', 'close_reading', 'language_analysis_writing'],
  'general knowledge': ['key_terminology', 'source_analysis', 'best_fit_judgement'],
};

const IB_B_LANGUAGE_TOPICS = [
  'Identities',
  'Experiences',
  'Human ingenuity',
  'Social organisation',
  'Sharing the planet',
  'Productive skills — writing',
  'Receptive skills — reading and listening',
  'Interactive oral assessment',
];

/* TS EAMCET and AP EAPCET both examine the Intermediate syllabus of the erstwhile combined
 * Andhra Pradesh board, and the two states have not diverged on content — only on the
 * conducting body and the rank list. Sharing these lists keeps that fact in one place
 * instead of inviting the two copies to drift. */
const EAMCET_MATHEMATICS_TOPICS = [
  'Functions, mathematical induction and binomial theorem',
  'Matrices and determinants',
  'Complex numbers and De Moivre’s theorem',
  'Theory of equations',
  'Permutations, combinations and partial fractions',
  'Trigonometric ratios, transformations and equations',
  'Inverse trigonometric and hyperbolic functions',
  'Properties of triangles',
  'Vector algebra — addition, products and applications',
  'Measures of dispersion and probability',
  'Random variables and probability distributions',
  'Locus, transformation of axes and the straight line',
  'Pair of straight lines',
  'Circles and system of circles',
  'Parabola, ellipse and hyperbola',
  'Three dimensional coordinates, direction cosines and planes',
  'Limits, continuity and differentiation',
  'Applications of derivatives',
  'Indefinite and definite integration',
  'Differential equations',
];

const EAMCET_PHYSICS_TOPICS = [
  'Physical world, units and measurements',
  'Motion in a straight line and motion in a plane',
  'Laws of motion',
  'Work, energy and power',
  'Systems of particles and rotational motion',
  'Oscillations',
  'Gravitation',
  'Mechanical properties of solids and fluids',
  'Thermal properties of matter',
  'Thermodynamics',
  'Kinetic theory of gases',
  'Waves',
  'Ray optics and optical instruments',
  'Wave optics',
  'Electric charges, fields, potential and capacitance',
  'Current electricity',
  'Moving charges, magnetism and magnetism and matter',
  'Electromagnetic induction and alternating current',
  'Electromagnetic waves',
  'Dual nature of radiation and matter, atoms and nuclei',
  'Semiconductor electronics and communication systems',
];

const EAMCET_CHEMISTRY_TOPICS = [
  'Atomic structure',
  'Classification of elements and periodicity in properties',
  'Chemical bonding and molecular structure',
  'States of matter — gases and liquids',
  'Stoichiometry',
  'Thermodynamics',
  'Chemical equilibrium and acids and bases',
  'Hydrogen and its compounds',
  's-Block elements — alkali and alkaline earth metals',
  'p-Block elements — groups 13 and 14',
  'Environmental chemistry',
  'Organic chemistry — basic principles, techniques and hydrocarbons',
  'Solid state',
  'Solutions',
  'Electrochemistry and chemical kinetics',
  'Surface chemistry',
  'General principles of metallurgy',
  'p-Block elements — groups 15 to 18',
  'd- and f-Block elements and coordination compounds',
  'Haloalkanes and haloarenes',
  'Alcohols, phenols and ethers',
  'Aldehydes, ketones and carboxylic acids',
  'Organic compounds containing nitrogen',
  'Polymers, biomolecules and chemistry in everyday life',
];

/** The Agriculture & Medical stream's Botany and Zoology papers, as one subject. */
const EAMCET_BIOLOGY_TOPICS = [
  'Diversity in the living world',
  'Structural organisation in plants — morphology',
  'Reproduction in plants',
  'Plant systematics',
  'Cell structure and function',
  'Internal organisation of plants',
  'Plant ecology',
  'Plant physiology',
  'Microbiology',
  'Genetics',
  'Molecular biology',
  'Biotechnology',
  'Plants, microbes and human welfare',
  'Animal kingdom — diversity of living world',
  'Structural organisation in animals',
  'Animal diversity — invertebrate phyla',
  'Animal diversity — phylum Chordata',
  'Locomotion and reproduction in Protozoa',
  'Biology in human welfare',
  'Type study of Periplaneta americana',
  'Ecology and environment',
  'Human anatomy and physiology — digestion, respiration and circulation',
  'Human anatomy and physiology — excretion, nervous and endocrine systems',
  'Human reproduction',
  'Genetics and applied biology',
];

/* The state CETs and the private-university tests all examine Class 11 and 12 science on a
 * state board syllabus that tracks NCERT closely. At the unit granularity used here those
 * syllabi agree, so they share these lists rather than carrying near-identical copies.
 * Anything a board genuinely examines differently belongs in its own list, not in here.
 * Note these are deliberately NOT reused by the JEE/NEET/EAMCET blocks above: topic ids are
 * UUIDv5 of the topic name, so renaming a seeded topic orphans its row and its subtopics. */
const NCERT_PHYSICS_TOPICS = [
  'Units, dimensions and measurement',
  'Kinematics — motion in a straight line and a plane',
  'Laws of motion and friction',
  'Work, energy and power',
  'Systems of particles and rotational motion',
  'Gravitation',
  'Mechanical properties of solids and fluids',
  'Thermal properties of matter and calorimetry',
  'Thermodynamics',
  'Kinetic theory of gases',
  'Oscillations',
  'Waves and sound',
  'Electric charges, fields and potential',
  'Capacitance',
  'Current electricity',
  'Moving charges, magnetism and magnetic materials',
  'Electromagnetic induction and alternating current',
  'Electromagnetic waves',
  'Ray optics and optical instruments',
  'Wave optics',
  'Dual nature of radiation and matter',
  'Atoms and nuclei',
  'Semiconductor electronics',
];

const NCERT_CHEMISTRY_TOPICS = [
  'Some basic concepts of chemistry and stoichiometry',
  'Structure of atom',
  'Classification of elements and periodicity',
  'Chemical bonding and molecular structure',
  'States of matter — gases and liquids',
  'Thermodynamics and thermochemistry',
  'Chemical and ionic equilibrium',
  'Redox reactions and electrochemistry',
  'Chemical kinetics',
  'Solid state',
  'Solutions and colligative properties',
  'Surface chemistry',
  'Hydrogen, s-Block and p-Block elements',
  'General principles of metallurgy',
  'd- and f-Block elements',
  'Coordination compounds',
  'Organic chemistry — basic principles and techniques',
  'Hydrocarbons',
  'Haloalkanes and haloarenes',
  'Alcohols, phenols and ethers',
  'Aldehydes, ketones and carboxylic acids',
  'Amines and diazonium salts',
  'Biomolecules',
  'Polymers and chemistry in everyday life',
  'Environmental chemistry',
];

const NCERT_MATHEMATICS_TOPICS = [
  'Sets, relations and functions',
  'Complex numbers and quadratic equations',
  'Matrices and determinants',
  'Permutations, combinations and binomial theorem',
  'Sequences and series',
  'Trigonometric functions and identities',
  'Inverse trigonometric functions',
  'Straight lines and pair of straight lines',
  'Circles and conic sections',
  'Three dimensional geometry',
  'Vector algebra',
  'Limits, continuity and differentiability',
  'Applications of derivatives',
  'Indefinite and definite integrals',
  'Applications of integrals — area under curves',
  'Differential equations',
  'Probability',
  'Statistics',
  'Linear programming',
  'Mathematical reasoning',
];

const NCERT_BIOLOGY_TOPICS = [
  'Diversity in the living world',
  'Biological classification',
  'Plant kingdom and animal kingdom',
  'Morphology and anatomy of flowering plants',
  'Structural organisation in animals',
  'Cell — structure and function',
  'Biomolecules and enzymes',
  'Cell cycle and cell division',
  'Transport and mineral nutrition in plants',
  'Photosynthesis and respiration in plants',
  'Plant growth and development',
  'Digestion and absorption',
  'Breathing and exchange of gases',
  'Body fluids and circulation',
  'Excretory products and their elimination',
  'Locomotion and movement',
  'Neural control and coordination',
  'Chemical coordination and integration',
  'Reproduction in flowering plants',
  'Human reproduction and reproductive health',
  'Principles of inheritance and variation',
  'Molecular basis of inheritance',
  'Evolution',
  'Human health and disease',
  'Microbes in human welfare',
  'Biotechnology — principles and applications',
  'Organisms, populations and ecosystems',
  'Biodiversity and conservation',
];

/** The English section BITSAT, VITEEE and SRMJEEE bolt onto their science papers. */
const ENTRANCE_ENGLISH_TOPICS = [
  'Grammar — tenses, articles and prepositions',
  'Grammar — subject-verb agreement and modals',
  'Sentence correction and error detection',
  'Vocabulary — synonyms and antonyms',
  'Vocabulary — one-word substitution and idioms',
  'Sentence completion and cloze',
  'Rearrangement of jumbled sentences',
  'Reading comprehension',
];

/** The aptitude section shared by VITEEE and SRMJEEE. */
const ENTRANCE_APTITUDE_TOPICS = [
  'Data interpretation — tables and charts',
  'Data sufficiency',
  'Syllogism and logical deduction',
  'Number series and coding-decoding',
  'Direction sense and blood relations',
  'Seating arrangement and puzzles',
  'Clocks, calendars and cubes',
];

export const INDIA_CURRICULUM: QualificationDef[] = [
  // ---------------------------------------------------------------- CBSE Class 10
  {
    qualId: 'cbse-10',
    board: 'cbse',
    subjects: [
      {
        subject: 'english language',
        specs: [
          {
            name: 'CBSE Class 10 English Language and Literature',
            topics: [
              'Reading comprehension — discursive and case-based passages',
              'Writing — formal letter',
              'Writing — analytical paragraph',
              'Grammar — tenses and modals',
              'Grammar — subject-verb concord and determiners',
              'Grammar — reported speech',
              'First Flight — prose',
              'First Flight — poetry',
              'Footprints Without Feet — supplementary reader',
              'Literature — themes, characters and extract-based questions',
            ],
          },
        ],
      },
      {
        subject: 'hindi',
        specs: [
          {
            name: 'CBSE Class 10 Hindi Course A',
            topics: [
              'Unseen passage comprehension (अपठित गद्यांश)',
              'Grammar (व्याकरण) — pad parichay and rachana',
              'Kshitij — poetry (काव्य खंड)',
              'Kshitij — prose (गद्य खंड)',
              'Kritika — supplementary reader',
              'Writing — letter, advertisement and article',
            ],
          },
          {
            name: 'CBSE Class 10 Hindi Course B',
            topics: [
              'Unseen passage comprehension (अपठित गद्यांश)',
              'Grammar (व्याकरण) — vakya bhed and samas',
              'Sparsh — poetry (काव्य खंड)',
              'Sparsh — prose (गद्य खंड)',
              'Sanchayan — supplementary reader',
              'Writing — letter, advertisement and article',
            ],
          },
        ],
      },
      {
        subject: 'sanskrit',
        specs: [
          {
            name: 'CBSE Class 10 Sanskrit (Communicative)',
            topics: [
              'Shemushi — prose passages',
              'Shemushi — poetry and shlokas',
              'Grammar — sandhi and samas',
              'Grammar — shabdroop and dhaturoop',
              'Grammar — pratyaya and karak',
              'Translation and comprehension',
              'Writing — patra lekhan and chitra varnan',
            ],
          },
        ],
      },
      {
        subject: 'mathematics',
        specs: [
          {
            name: 'CBSE Class 10 Mathematics',
            tiers: ['Standard', 'Basic'],
            topics: [
              'Real numbers',
              'Polynomials',
              'Pair of linear equations in two variables',
              'Quadratic equations',
              'Arithmetic progressions',
              'Triangles',
              'Coordinate geometry',
              'Introduction to trigonometry',
              'Some applications of trigonometry',
              'Circles',
              'Areas related to circles',
              'Surface areas and volumes',
              'Statistics',
              'Probability',
            ],
          },
        ],
      },
      {
        subject: 'science',
        specs: [
          {
            name: 'CBSE Class 10 Science',
            topics: [
              'Chemical reactions and equations',
              'Acids, bases and salts',
              'Metals and non-metals',
              'Carbon and its compounds',
              'Periodic classification of elements',
              'Life processes',
              'Control and coordination',
              'How do organisms reproduce',
              'Heredity',
              'Light — reflection and refraction',
              'The human eye and the colourful world',
              'Electricity',
              'Magnetic effects of electric current',
              'Our environment',
            ],
          },
        ],
      },
      {
        subject: 'social science',
        specs: [
          {
            name: 'CBSE Class 10 Social Science',
            topics: [
              'History — the rise of nationalism in Europe',
              'History — nationalism in India',
              'History — the making of a global world',
              'History — the age of industrialisation',
              'History — print culture and the modern world',
              'Geography — resources and development',
              'Geography — forest and wildlife resources',
              'Geography — water resources',
              'Geography — agriculture',
              'Geography — minerals and energy resources',
              'Geography — manufacturing industries',
              'Geography — lifelines of the national economy',
              'Political Science — power sharing',
              'Political Science — federalism',
              'Political Science — gender, religion and caste',
              'Political Science — political parties',
              'Political Science — outcomes of democracy',
              'Economics — development',
              'Economics — sectors of the Indian economy',
              'Economics — money and credit',
              'Economics — globalisation and the Indian economy',
              'Economics — consumer rights',
            ],
          },
        ],
      },
      {
        subject: 'computer applications',
        specs: [
          {
            name: 'CBSE Class 10 Computer Applications (Code 165)',
            topics: [
              'Computer networking fundamentals',
              'Internet services and applications',
              'HTML — structure and text formatting',
              'HTML — lists, links and images',
              'HTML — tables',
              'HTML — forms',
              'Cascading Style Sheets',
              'Cyber ethics, cyber crime and safety',
            ],
          },
        ],
      },
      {
        subject: 'information technology',
        specs: [
          {
            name: 'CBSE Class 10 Information Technology (Code 402)',
            topics: [
              'Digital documentation (advanced)',
              'Electronic spreadsheet (advanced)',
              'Database management system',
              'Web applications and security',
              'Communication skills',
              'Self-management skills',
              'ICT skills',
              'Entrepreneurial skills',
              'Green skills',
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- CBSE Class 12
  {
    qualId: 'cbse-12',
    board: 'cbse',
    subjects: [
      {
        subject: 'english language',
        specs: [
          {
            name: 'CBSE Class 12 English Core',
            topics: [
              'Reading comprehension and note-making',
              'Writing — notice, advertisement and poster',
              'Writing — formal letter and job application',
              'Writing — article and report',
              'Flamingo — prose',
              'Flamingo — poetry',
              'Vistas — supplementary reader',
              'Literature — themes, characters and extract-based questions',
            ],
          },
        ],
      },
      {
        subject: 'hindi',
        specs: [
          {
            name: 'CBSE Class 12 Hindi Core',
            topics: [
              'Aroh — poetry (काव्य खंड)',
              'Aroh — prose (गद्य खंड)',
              'Vitan — supplementary reader',
              'Abhivyakti aur Madhyam — expression and media writing',
              'Unseen passage comprehension',
              'Writing — feature, report and editorial',
            ],
          },
        ],
      },
      {
        subject: 'physics',
        specs: [
          {
            name: 'CBSE Class 12 Physics',
            topics: [
              'Electric charges and fields',
              'Electrostatic potential and capacitance',
              'Current electricity',
              'Moving charges and magnetism',
              'Magnetism and matter',
              'Electromagnetic induction',
              'Alternating current',
              'Electromagnetic waves',
              'Ray optics and optical instruments',
              'Wave optics',
              'Dual nature of radiation and matter',
              'Atoms',
              'Nuclei',
              'Semiconductor electronics',
            ],
          },
        ],
      },
      {
        subject: 'chemistry',
        specs: [
          {
            name: 'CBSE Class 12 Chemistry',
            topics: [
              'Solutions',
              'Electrochemistry',
              'Chemical kinetics',
              'The d- and f-block elements',
              'Coordination compounds',
              'Haloalkanes and haloarenes',
              'Alcohols, phenols and ethers',
              'Aldehydes, ketones and carboxylic acids',
              'Amines',
              'Biomolecules',
            ],
          },
        ],
      },
      {
        subject: 'biology',
        specs: [
          {
            name: 'CBSE Class 12 Biology',
            topics: [
              'Sexual reproduction in flowering plants',
              'Human reproduction',
              'Reproductive health',
              'Principles of inheritance and variation',
              'Molecular basis of inheritance',
              'Evolution',
              'Human health and disease',
              'Microbes in human welfare',
              'Biotechnology — principles and processes',
              'Biotechnology and its applications',
              'Organisms and populations',
              'Ecosystem',
              'Biodiversity and conservation',
            ],
          },
        ],
      },
      {
        subject: 'mathematics',
        specs: [
          {
            name: 'CBSE Class 12 Mathematics',
            topics: [
              'Relations and functions',
              'Inverse trigonometric functions',
              'Matrices',
              'Determinants',
              'Continuity and differentiability',
              'Applications of derivatives',
              'Integrals',
              'Applications of integrals',
              'Differential equations',
              'Vector algebra',
              'Three-dimensional geometry',
              'Linear programming',
              'Probability',
            ],
          },
          {
            name: 'CBSE Class 12 Applied Mathematics',
            topics: [
              'Numbers, quantification and numerical applications',
              'Algebra',
              'Calculus',
              'Probability distributions',
              'Inferential statistics',
              'Index numbers and time-based data',
              'Financial mathematics',
              'Linear programming',
            ],
          },
        ],
      },
      {
        subject: 'computer science',
        specs: [
          {
            name: 'CBSE Class 12 Computer Science (Code 083)',
            topics: [
              'Python revision — functions and modules',
              'Data file handling',
              'Data structures — stacks',
              'Computer networks',
              'Database concepts',
              'Structured Query Language (SQL)',
              'Interface Python with MySQL',
              'Exception handling',
            ],
          },
          {
            name: 'CBSE Class 12 Informatics Practices (Code 065)',
            topics: [
              'Data handling using Pandas — series and dataframes',
              'Data visualization using Matplotlib',
              'Database query using SQL',
              'Introduction to computer networks',
              'Societal impacts — digital footprint and cyber law',
            ],
          },
        ],
      },
      {
        subject: 'accountancy',
        specs: [
          {
            name: 'CBSE Class 12 Accountancy',
            topics: [
              'Accounting for partnership firms — fundamentals',
              'Goodwill — nature and valuation',
              'Reconstitution of partnership — change in profit sharing ratio',
              'Reconstitution of partnership — admission of a partner',
              'Reconstitution of partnership — retirement and death',
              'Dissolution of a partnership firm',
              'Accounting for share capital',
              'Issue and redemption of debentures',
              'Financial statements of a company',
              'Analysis of financial statements and accounting ratios',
              'Cash flow statement',
            ],
          },
        ],
      },
      {
        subject: 'business studies',
        specs: [
          {
            name: 'CBSE Class 12 Business Studies',
            topics: [
              'Nature and significance of management',
              'Principles of management',
              'Business environment',
              'Planning',
              'Organising',
              'Staffing',
              'Directing',
              'Controlling',
              'Financial management',
              'Financial markets',
              'Marketing management',
              'Consumer protection',
            ],
          },
        ],
      },
      {
        subject: 'economics',
        specs: [
          {
            name: 'CBSE Class 12 Economics',
            topics: [
              'Introduction to macroeconomics',
              'National income and related aggregates',
              'Money and banking',
              'Determination of income and employment',
              'Government budget and the economy',
              'Balance of payments',
              'Indian economy on the eve of independence',
              'Economic reforms since 1991',
              'Current challenges facing the Indian economy',
              'Development experience of India — a comparison with neighbours',
            ],
          },
        ],
      },
      {
        subject: 'history',
        specs: [
          {
            name: 'CBSE Class 12 History',
            topics: [
              'Bricks, beads and bones — the Harappan civilisation',
              'Kings, farmers and towns — early states and economies',
              'Kinship, caste and class',
              'Thinkers, beliefs and buildings',
              'Through the eyes of travellers',
              'Bhakti-Sufi traditions',
              'An imperial capital — Vijayanagara',
              'Peasants, zamindars and the state',
              'Kings and chronicles — the Mughal courts',
              'Colonialism and the countryside',
              'Rebels and the Raj — the revolt of 1857',
              'Colonial cities',
              'Mahatma Gandhi and the nationalist movement',
              'Understanding partition',
              'Framing the constitution',
            ],
          },
        ],
      },
      {
        subject: 'political science',
        specs: [
          {
            name: 'CBSE Class 12 Political Science',
            topics: [
              'The cold war era',
              'The end of bipolarity',
              'US hegemony in world politics',
              'Alternative centres of power',
              'Contemporary South Asia',
              'International organisations',
              'Security in the contemporary world',
              'Environment and natural resources',
              'Globalisation',
              'Challenges of nation building',
              'Era of one-party dominance',
              'Politics of planned development',
              "India's external relations",
              'Challenges to and restoration of the Congress system',
              'Crisis of democratic order',
              'Regional aspirations',
              'Recent developments in Indian politics',
            ],
          },
        ],
      },
      {
        subject: 'geography',
        specs: [
          {
            name: 'CBSE Class 12 Geography',
            topics: [
              'Human geography — nature and scope',
              'The world population — distribution, density and growth',
              'Human development',
              'Primary activities',
              'Secondary activities',
              'Tertiary and quaternary activities',
              'Transport and communication',
              'International trade',
              'Population of India',
              'Migration — types, causes and consequences',
              'Human settlements in India',
              'Land resources and agriculture',
              'Water resources',
              'Mineral and energy resources',
              'Planning and sustainable development',
              'Geographical perspective on selected issues and problems',
            ],
          },
        ],
      },
      {
        subject: 'sociology',
        specs: [
          {
            name: 'CBSE Class 12 Sociology',
            topics: [
              'Introducing Indian society',
              'The demographic structure of Indian society',
              'Social institutions — continuity and change',
              'The market as a social institution',
              'Patterns of social inequality and exclusion',
              'The challenges of cultural diversity',
              'Structural change',
              'Cultural change',
              'The story of Indian democracy',
              'Change and development in rural society',
              'Change and development in industrial society',
              'Globalisation and social change',
              'Mass media and communications',
              'Social movements',
            ],
          },
        ],
      },
      {
        subject: 'psychology',
        specs: [
          {
            name: 'CBSE Class 12 Psychology',
            topics: [
              'Variations in psychological attributes',
              'Self and personality',
              'Meeting life challenges',
              'Psychological disorders',
              'Therapeutic approaches',
              'Attitude and social cognition',
              'Social influence and group processes',
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- ICSE (Class 10)
  {
    qualId: 'icse',
    board: 'cisce',
    subjects: [
      {
        subject: 'english language',
        specs: [
          {
            name: 'ICSE English Language (Paper 1)',
            topics: [
              'Composition — descriptive, narrative and argumentative',
              'Letter writing — formal and informal',
              'Email writing',
              'Notice and article writing',
              'Comprehension passage',
              'Grammar — tenses and voice',
              'Grammar — transformation of sentences',
              'Vocabulary, phrasal verbs and idioms',
            ],
          },
        ],
      },
      {
        subject: 'english literature',
        specs: [
          {
            name: 'ICSE Literature in English (Paper 2)',
            topics: [
              'Drama — The Merchant of Venice',
              'Poetry — Treasure Chest anthology',
              'Prose — Treasure Chest short stories',
              'Character analysis',
              'Themes and moral values',
              'Context and extract-based questions',
              'Critical appreciation',
            ],
          },
        ],
      },
      {
        subject: 'hindi',
        specs: [
          {
            name: 'ICSE Hindi',
            topics: [
              'Composition (निबंध लेखन)',
              'Letter writing (पत्र लेखन)',
              'Unseen passage comprehension',
              'Grammar (व्याकरण)',
              'Sahitya Sagar — poetry (काव्य)',
              'Sahitya Sagar — prose (गद्य)',
              'Ekanki Sanchay — one-act plays',
            ],
          },
        ],
      },
      {
        subject: 'sanskrit',
        specs: [
          {
            name: 'ICSE Sanskrit',
            topics: [
              'Prose passages',
              'Poetry and shlokas',
              'Grammar — sandhi and samas',
              'Grammar — shabdroop and dhaturoop',
              'Translation — Sanskrit to Hindi and English',
              'Composition and comprehension',
            ],
          },
        ],
      },
      {
        subject: 'french',
        specs: [
          {
            name: 'ICSE French',
            topics: [
              'Composition and letter writing',
              'Comprehension passage',
              'Grammar — verb conjugation and tenses',
              'Grammar — articles, pronouns and prepositions',
              'Translation — French to English and English to French',
              'Vocabulary and idiomatic expressions',
            ],
          },
        ],
      },
      {
        subject: 'history and civics',
        specs: [
          {
            name: 'ICSE History and Civics',
            topics: [
              'Civics — the Union Legislature',
              'Civics — the Union Executive',
              'Civics — the Judiciary',
              'History — the First War of Independence, 1857',
              'History — growth of nationalism',
              'History — first phase of the national movement',
              'History — the Muslim League and the demand for Pakistan',
              'History — Mahatma Gandhi and the mass movements',
              'History — Forward Bloc and the INA',
              'History — independence and partition of India',
              'History — the First World War',
              'History — rise of dictatorships',
              'History — the Second World War',
              'History — the United Nations',
              'History — the Non-Aligned Movement',
            ],
          },
        ],
      },
      {
        subject: 'geography',
        specs: [
          {
            name: 'ICSE Geography',
            topics: [
              'Interpretation of topographical maps',
              'Map work — Survey of India toposheets',
              'Location, extent and physical features of India',
              'Climate of India',
              'Soil resources',
              'Natural vegetation',
              'Water resources and irrigation',
              'Mineral and energy resources',
              'Agriculture in India',
              'Industries in India',
              'Transport',
              'Waste management',
            ],
          },
        ],
      },
      {
        subject: 'mathematics',
        specs: [
          {
            name: 'ICSE Mathematics',
            topics: [
              'Goods and Services Tax (GST)',
              'Banking — recurring deposit accounts',
              'Shares and dividends',
              'Linear inequations',
              'Quadratic equations',
              'Ratio and proportion',
              'Factorisation of polynomials',
              'Matrices',
              'Arithmetic and geometric progression',
              'Coordinate geometry — reflection and section formula',
              'Equation of a straight line',
              'Similarity',
              'Loci',
              'Circles — tangents and chord properties',
              'Constructions',
              'Mensuration — cylinder, cone and sphere',
              'Trigonometric identities',
              'Heights and distances',
              'Statistics — mean, median and mode',
              'Probability',
            ],
          },
        ],
      },
      {
        subject: 'science',
        specs: [
          {
            name: 'ICSE Science Paper 1 (Physics)',
            topics: [
              'Force, turning effect and equilibrium',
              'Work, power and energy',
              'Machines',
              'Refraction of light at plane surfaces',
              'Refraction through a lens',
              'Spectrum and dispersion',
              'Sound',
              'Current electricity',
              'Electrical power and household circuits',
              'Electromagnetism',
              'Calorimetry',
              'Radioactivity',
            ],
          },
          {
            name: 'ICSE Science Paper 2 (Chemistry)',
            topics: [
              'Periodic properties and variations',
              'Chemical bonding',
              'Study of acids, bases and salts',
              'Analytical chemistry',
              'Mole concept and stoichiometry',
              'Electrolysis',
              'Metallurgy',
              'Study of compounds — hydrogen chloride',
              'Study of compounds — ammonia',
              'Study of compounds — nitric acid',
              'Study of compounds — sulphuric acid',
              'Organic chemistry',
            ],
          },
          {
            name: 'ICSE Science Paper 3 (Biology)',
            topics: [
              'Cell cycle and cell division',
              'Structure of chromosomes',
              'Genetics — Mendelian inheritance',
              'Absorption by roots',
              'Transpiration',
              'Photosynthesis',
              'Transportation in plants and humans',
              'Excretory system',
              'Nervous system',
              'Endocrine system',
              'The reproductive system',
              'Population and human evolution',
            ],
          },
        ],
      },
      {
        subject: 'economics',
        specs: [
          {
            name: 'ICSE Economics',
            topics: [
              'Understanding an economy',
              'Factors of production',
              'Theory of demand',
              'Theory of supply',
              'Market and price determination',
              'Money and banking',
              'Inflation',
              'Consumer awareness and protection',
            ],
          },
        ],
      },
      {
        subject: 'commercial studies',
        specs: [
          {
            name: 'ICSE Commercial Studies',
            topics: [
              'Business environment',
              'Departmental undertakings and the public sector',
              'Marketing and consumer protection',
              'Business finance',
              'Trade — home and foreign',
              'Communication in business',
              'Banking',
              'Insurance',
              'Human resource management',
            ],
          },
        ],
      },
      {
        subject: 'computer applications',
        specs: [
          {
            name: 'ICSE Computer Applications',
            topics: [
              'Class fundamentals and objects',
              'Constructors',
              'User-defined methods',
              'Library classes and wrapper classes',
              'Encapsulation and access specifiers',
              'Arrays — single and double dimensional',
              'String handling',
              'Iterative constructs',
              'Nested loops',
              'Input in Java',
            ],
          },
        ],
      },
      {
        subject: 'environmental science',
        specs: [
          {
            name: 'ICSE Environmental Science',
            topics: [
              'Ecosystems',
              'Natural resources and their management',
              'Pollution — air, water, soil and noise',
              'Waste management',
              'Sustainable development',
              'Environmental laws and policies',
              'Biodiversity conservation',
              'Climate change',
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- ISC (Class 12)
  {
    qualId: 'isc',
    board: 'cisce',
    subjects: [
      {
        subject: 'english language',
        specs: [
          {
            name: 'ISC English Language (Paper 1)',
            topics: [
              'Composition — essay writing',
              'Directed writing',
              'Article and report writing',
              'Proposal writing',
              'Comprehension and summary',
              'Grammar and usage',
            ],
          },
        ],
      },
      {
        subject: 'english literature',
        specs: [
          {
            name: 'ISC Literature in English (Paper 2)',
            topics: [
              'Drama — prescribed Shakespeare play',
              'Poetry — prescribed anthology',
              'Prose — prescribed short stories',
              'Novel study',
              'Character and theme analysis',
              'Critical appreciation',
              'Context and extract-based questions',
            ],
          },
        ],
      },
      {
        subject: 'hindi',
        specs: [
          {
            name: 'ISC Hindi',
            topics: [
              'Nibandh (essay writing)',
              'Comprehension passage',
              'Translation',
              'Gadya Sankalan — prose',
              'Padya Sankalan — poetry',
              'Drama and novel study',
            ],
          },
        ],
      },
      {
        subject: 'physics',
        specs: [
          {
            name: 'ISC Physics',
            topics: [
              'Electrostatics',
              'Current electricity',
              'Magnetic effects of current and magnetism',
              'Electromagnetic induction and alternating currents',
              'Electromagnetic waves',
              'Ray optics and optical instruments',
              'Wave optics',
              'Dual nature of radiation and matter',
              'Atoms and nuclei',
              'Electronic devices',
              'Communication systems',
            ],
          },
        ],
      },
      {
        subject: 'chemistry',
        specs: [
          {
            name: 'ISC Chemistry',
            topics: [
              'Solid state',
              'Solutions',
              'Electrochemistry',
              'Chemical kinetics',
              'Surface chemistry',
              'The p-block elements',
              'The d- and f-block elements',
              'Coordination compounds',
              'Haloalkanes and haloarenes',
              'Alcohols, phenols and ethers',
              'Aldehydes, ketones and carboxylic acids',
              'Organic compounds containing nitrogen',
              'Biomolecules',
              'Polymers',
              'Chemistry in everyday life',
            ],
          },
        ],
      },
      {
        subject: 'biology',
        specs: [
          {
            name: 'ISC Biology',
            topics: [
              'Reproduction in plants',
              'Reproduction in humans',
              'Principles of inheritance and variation',
              'Molecular basis of inheritance',
              'Evolution',
              'Biology in human welfare — health and disease',
              'Biotechnology and its applications',
              'Ecology and environment',
              'Plant physiology',
              'Human physiology',
            ],
          },
        ],
      },
      {
        subject: 'mathematics',
        specs: [
          {
            name: 'ISC Mathematics',
            topics: [
              'Relations and functions',
              'Inverse trigonometric functions',
              'Matrices and determinants',
              'Continuity and differentiability',
              'Applications of derivatives',
              'Integrals',
              'Differential equations',
              'Vectors',
              'Three-dimensional geometry',
              'Probability',
              'Linear regression',
              'Linear programming',
              'Application of calculus in commerce and economics',
            ],
          },
        ],
      },
      {
        subject: 'computer science',
        specs: [
          {
            name: 'ISC Computer Science',
            topics: [
              'Boolean algebra',
              'Computer hardware and logic gates',
              'Implementation of algorithms',
              'Programming in Java — classes and objects',
              'Inheritance and polymorphism',
              'Data structures — stacks and queues',
              'Recursion',
              'Arrays and string manipulation',
              'Data file handling',
              'Complexity and big O notation',
            ],
          },
        ],
      },
      {
        subject: 'accountancy',
        specs: [
          {
            name: 'ISC Accounts',
            topics: [
              'Partnership accounts — fundamentals',
              'Goodwill — nature and valuation',
              'Admission of a partner',
              'Retirement and death of a partner',
              'Dissolution of a partnership firm',
              'Joint stock company accounts',
              'Issue of shares and debentures',
              'Financial statement analysis',
              'Cash flow statement',
              'Ratio analysis',
            ],
          },
        ],
      },
      {
        subject: 'commerce',
        specs: [
          {
            name: 'ISC Commerce',
            topics: [
              'Business environment',
              'Forms of business organisation',
              'Management — nature and functions',
              'Business finance',
              'Marketing',
              'Consumer protection',
              'Human resource management',
              'International business',
              'Entrepreneurship',
            ],
          },
        ],
      },
      {
        subject: 'economics',
        specs: [
          {
            name: 'ISC Economics',
            topics: [
              'Microeconomics — demand and supply',
              'Elasticity of demand',
              'Consumer behaviour',
              'Production and cost',
              'Forms of market',
              'Macroeconomics — national income',
              'Money and banking',
              'Determination of income and employment',
              'Public finance',
              'Balance of payments and exchange rate',
              'Indian economic development',
            ],
          },
        ],
      },
      {
        subject: 'business studies',
        specs: [
          {
            name: 'ISC Business Studies',
            topics: [
              'Nature and significance of management',
              'Principles of management',
              'Business environment',
              'Planning and organising',
              'Staffing and directing',
              'Controlling',
              'Financial management',
              'Financial markets',
              'Marketing management',
              'Consumer protection',
            ],
          },
        ],
      },
      {
        subject: 'history',
        specs: [
          {
            name: 'ISC History',
            topics: [
              'The Indian national movement, 1900-1947',
              'Partition and independence',
              'Making of the Indian constitution',
              'The Nehruvian era',
              'India after Nehru',
              'The First World War and its aftermath',
              'The Russian revolution',
              'Rise of fascism and nazism',
              'The Second World War',
              'The Cold War',
              'Decolonisation in Asia and Africa',
            ],
          },
        ],
      },
      {
        subject: 'geography',
        specs: [
          {
            name: 'ISC Geography',
            topics: [
              'Interpretation of topographical maps',
              'Physical features of India',
              'Drainage systems',
              'Climate, weather and seasons',
              'Soil resources and conservation',
              'Natural vegetation',
              'Population distribution and density',
              'Migration and urbanisation',
              'Agriculture and cropping patterns',
              'Mineral and power resources',
              'Manufacturing industries',
              'Transport and communication',
              'Waste management',
              'Remote sensing and GIS',
            ],
          },
        ],
      },
      {
        subject: 'political science',
        specs: [
          {
            name: 'ISC Political Science',
            topics: [
              'The Indian constitution',
              'Fundamental rights and duties',
              'The union legislature',
              'The union executive',
              'The judiciary',
              'State government',
              'Local self-government',
              'Political parties and pressure groups',
              'Elections and electoral reforms',
              'Federalism in India',
              'International relations',
              'The United Nations',
            ],
          },
        ],
      },
      {
        subject: 'sociology',
        specs: [
          {
            name: 'ISC Sociology',
            topics: [
              'Introduction to sociology',
              'Social institutions — family and marriage',
              'Kinship',
              'Religion and society',
              'Tribal society in India',
              'Social stratification',
              'Social change and development',
              'Sanskritisation and westernisation',
              'Social problems in India',
              'Social movements and social legislation',
            ],
          },
        ],
      },
      {
        subject: 'psychology',
        specs: [
          {
            name: 'ISC Psychology',
            topics: [
              'Foundations of psychology',
              'Methods of psychology',
              'Human development',
              'Intelligence and ability',
              'Personality',
              'Learning',
              'Memory and forgetting',
              'Motivation and emotion',
              'Stress and health',
              'Psychological disorders',
              'Therapeutic approaches',
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------- IB Diploma Programme
  {
    qualId: 'ib-dp',
    board: 'ib',
    subjects: [
      {
        subject: 'english language',
        specs: [
          {
            name: 'IB DP English A: Language and Literature',
            tiers: ['HL', 'SL'],
            topics: [
              'Readers, writers and texts',
              'Time and space',
              'Intertextuality — connecting texts',
              'Non-literary text analysis',
              'Literary works study',
              'The learner portfolio',
              'Paper 1 — guided textual analysis',
              'Paper 2 — comparative essay',
              'Individual oral',
            ],
            tierTopics: { HL: ['HL essay'] },
          },
        ],
      },
      {
        subject: 'english literature',
        specs: [
          {
            name: 'IB DP English A: Literature',
            tiers: ['HL', 'SL'],
            topics: [
              'Readers, writers and texts',
              'Time and space',
              'Intertextuality — connecting texts',
              'Prescribed literary works',
              'Poetry analysis',
              'Prose — novel and short story',
              'Drama',
              'Paper 1 — guided literary analysis',
              'Paper 2 — comparative essay',
              'Individual oral',
            ],
            tierTopics: { HL: ['HL essay'] },
          },
        ],
      },
      {
        subject: 'hindi',
        specs: [
          {
            name: 'IB DP Hindi B',
            tiers: ['HL', 'SL'],
            topics: IB_B_LANGUAGE_TOPICS,
            tierTopics: { HL: ['Literary works study'] },
          },
        ],
      },
      {
        subject: 'french',
        specs: [
          {
            name: 'IB DP French B',
            tiers: ['HL', 'SL'],
            topics: IB_B_LANGUAGE_TOPICS,
            tierTopics: { HL: ['Literary works study'] },
          },
        ],
      },
      {
        subject: 'spanish',
        specs: [
          {
            name: 'IB DP Spanish B',
            tiers: ['HL', 'SL'],
            topics: IB_B_LANGUAGE_TOPICS,
            tierTopics: { HL: ['Literary works study'] },
          },
        ],
      },
      {
        subject: 'history',
        specs: [
          {
            name: 'IB DP History',
            tiers: ['HL', 'SL'],
            topics: [
              'Prescribed subject — rights and protest',
              'Prescribed subject — conflict and intervention',
              'World history — authoritarian states',
              'World history — causes and effects of wars',
              'World history — the Cold War',
              'Historical investigation (internal assessment)',
            ],
            tierTopics: {
              HL: ['HL option — history of Asia and Oceania', 'HL option — history of Europe'],
            },
          },
        ],
      },
      {
        subject: 'geography',
        specs: [
          {
            name: 'IB DP Geography',
            tiers: ['HL', 'SL'],
            topics: [
              'Changing population',
              'Global climate — vulnerability and resilience',
              'Global resource consumption and security',
              'Freshwater — drainage basins',
              'Oceans and coastal margins',
              'Extreme environments',
              'Geophysical hazards',
              'Leisure, tourism and sport',
              'Food and health',
              'Urban environments',
              'Fieldwork investigation (internal assessment)',
            ],
            tierTopics: {
              HL: [
                'HL extension — power, places and networks',
                'HL extension — human development and diversity',
                'HL extension — global risks and resilience',
              ],
            },
          },
        ],
      },
      {
        subject: 'economics',
        specs: [
          {
            name: 'IB DP Economics',
            tiers: ['HL', 'SL'],
            topics: [
              'Introduction to economics',
              'Microeconomics — demand and supply',
              'Elasticity',
              'Government intervention',
              'Market failure',
              'Macroeconomics — measuring economic activity',
              'Aggregate demand and aggregate supply',
              'Macroeconomic objectives',
              'The global economy — international trade',
              'Exchange rates and the balance of payments',
              'Economic development',
              'Internal assessment portfolio',
            ],
            tierTopics: {
              HL: ['HL — theory of the firm', 'HL — the Keynesian multiplier'],
            },
          },
        ],
      },
      {
        subject: 'psychology',
        specs: [
          {
            name: 'IB DP Psychology',
            tiers: ['HL', 'SL'],
            topics: [
              'Biological approach to behaviour',
              'Cognitive approach to behaviour',
              'Sociocultural approach to behaviour',
              'Research methodology',
              'Ethics in psychological research',
              'Abnormal psychology',
              'Health psychology',
              'Human relationships',
              'Developmental psychology',
              'Internal assessment — experimental study',
            ],
          },
        ],
      },
      {
        subject: 'business',
        specs: [
          {
            name: 'IB DP Business Management',
            tiers: ['HL', 'SL'],
            topics: [
              'Business organisation and environment',
              'Human resource management',
              'Finance and accounts',
              'Marketing',
              'Operations management',
              'Business tools — SWOT and Ansoff',
              'Internal assessment — business research project',
            ],
            tierTopics: {
              HL: ['HL — organisational planning tools', 'HL — business strategy'],
            },
          },
        ],
      },
      {
        subject: 'global politics',
        specs: [
          {
            name: 'IB DP Global Politics',
            tiers: ['HL', 'SL'],
            topics: [
              'Power, sovereignty and international relations',
              'Human rights',
              'Development',
              'Peace and conflict',
              'Engagement activity',
              'Political issues analysis',
            ],
            tierTopics: { HL: ['HL extension — global political challenges'] },
          },
        ],
      },
      {
        subject: 'biology',
        specs: [
          {
            name: 'IB DP Biology',
            tiers: ['HL', 'SL'],
            topics: [
              'Unity and diversity — molecules',
              'Unity and diversity — cells',
              'Unity and diversity — organisms',
              'Unity and diversity — ecosystems',
              'Form and function — molecules',
              'Form and function — cells',
              'Form and function — organisms',
              'Form and function — ecosystems',
              'Interaction and interdependence',
              'Continuity and change',
              'Scientific investigation (internal assessment)',
            ],
          },
        ],
      },
      {
        subject: 'chemistry',
        specs: [
          {
            name: 'IB DP Chemistry',
            tiers: ['HL', 'SL'],
            topics: [
              'Models of the particulate nature of matter',
              'Atomic structure',
              'The periodic table',
              'Chemical bonding and structure',
              'Energetics and thermochemistry',
              'Chemical kinetics',
              'Equilibrium',
              'Acids and bases',
              'Redox processes',
              'Organic chemistry',
              'Measurement and analysis',
              'Scientific investigation (internal assessment)',
            ],
          },
        ],
      },
      {
        subject: 'physics',
        specs: [
          {
            name: 'IB DP Physics',
            tiers: ['HL', 'SL'],
            topics: [
              'Space, time and motion',
              'The particulate nature of matter',
              'Wave behaviour',
              'Fields',
              'Nuclear and quantum physics',
              'Measurements and uncertainties',
              'Energy and its transfer',
              'Circular motion and gravitation',
              'Scientific investigation (internal assessment)',
            ],
          },
        ],
      },
      {
        subject: 'computer science',
        specs: [
          {
            name: 'IB DP Computer Science',
            tiers: ['HL', 'SL'],
            topics: [
              'System fundamentals',
              'Computer organisation',
              'Networks',
              'Computational thinking and problem solving',
              'Object-oriented programming',
              'Internal assessment — solution development',
            ],
            tierTopics: {
              HL: ['HL — abstract data structures', 'HL — resource management', 'HL — control'],
            },
          },
        ],
      },
      {
        subject: 'environmental science',
        specs: [
          {
            name: 'IB DP Environmental Systems and Societies',
            tiers: ['HL', 'SL'],
            topics: [
              'Foundations of environmental systems and societies',
              'Ecosystems and ecology',
              'Biodiversity and conservation',
              'Water and aquatic food production systems',
              'Soil systems and terrestrial food production',
              'Atmospheric systems and society',
              'Climate change and energy production',
              'Human systems and resource use',
              'Internal assessment',
            ],
          },
        ],
      },
      {
        subject: 'mathematics',
        specs: [
          {
            name: 'IB DP Mathematics: Analysis and Approaches',
            tiers: ['HL', 'SL'],
            topics: [
              'Number and algebra',
              'Functions',
              'Geometry and trigonometry',
              'Statistics and probability',
              'Calculus',
              'Proof and reasoning',
              'Mathematical exploration (internal assessment)',
            ],
          },
          {
            name: 'IB DP Mathematics: Applications and Interpretation',
            tiers: ['HL', 'SL'],
            topics: [
              'Number and algebra',
              'Functions',
              'Geometry and trigonometry',
              'Statistics and probability',
              'Calculus',
              'Mathematical modelling',
              'Mathematical exploration (internal assessment)',
            ],
          },
        ],
      },
      {
        subject: 'visual arts',
        specs: [
          {
            name: 'IB DP Visual Arts',
            tiers: ['HL', 'SL'],
            topics: [
              'Visual arts in context',
              'Visual arts methods',
              'Communicating visual arts',
              'Comparative study',
              'Process portfolio',
              'Exhibition',
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- JEE Main
  {
    qualId: 'jee-main',
    board: 'nta',
    subjects: [
      {
        subject: 'physics',
        specs: [
          {
            name: 'JEE Main Physics',
            topics: [
              'Units and measurements',
              'Kinematics',
              'Laws of motion',
              'Work, energy and power',
              'Rotational motion',
              'Gravitation',
              'Properties of solids and liquids',
              'Thermodynamics',
              'Kinetic theory of gases',
              'Oscillations and waves',
              'Electrostatics',
              'Current electricity',
              'Magnetic effects of current and magnetism',
              'Electromagnetic induction and alternating currents',
              'Electromagnetic waves',
              'Optics',
              'Dual nature of matter and radiation',
              'Atoms and nuclei',
              'Electronic devices',
              'Experimental skills',
            ],
          },
        ],
      },
      {
        subject: 'chemistry',
        specs: [
          {
            name: 'JEE Main Chemistry',
            topics: [
              'Some basic concepts in chemistry',
              'Atomic structure',
              'Chemical bonding and molecular structure',
              'Chemical thermodynamics',
              'Solutions',
              'Equilibrium',
              'Redox reactions and electrochemistry',
              'Chemical kinetics',
              'Classification of elements and periodicity in properties',
              'p-Block elements',
              'd- and f-Block elements',
              'Co-ordination compounds',
              'Purification and characterisation of organic compounds',
              'Some basic principles of organic chemistry',
              'Hydrocarbons',
              'Organic compounds containing halogens',
              'Organic compounds containing oxygen',
              'Organic compounds containing nitrogen',
              'Biomolecules',
              'Principles related to practical chemistry',
            ],
          },
        ],
      },
      {
        subject: 'mathematics',
        specs: [
          {
            name: 'JEE Main Mathematics',
            topics: [
              'Sets, relations and functions',
              'Complex numbers and quadratic equations',
              'Matrices and determinants',
              'Permutations and combinations',
              'Binomial theorem and its simple applications',
              'Sequence and series',
              'Limit, continuity and differentiability',
              'Integral calculus',
              'Differential equations',
              'Co-ordinate geometry — straight lines',
              'Co-ordinate geometry — conic sections',
              'Three dimensional geometry',
              'Vector algebra',
              'Statistics and probability',
              'Trigonometry',
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- JEE Advanced
  {
    qualId: 'jee-advanced',
    board: 'iit',
    subjects: [
      {
        subject: 'physics',
        specs: [
          {
            name: 'JEE Advanced Physics',
            topics: [
              'General physics and measurement',
              'Kinematics',
              'Newton’s laws of motion',
              'Systems of particles, momentum and collisions',
              'Work, energy and power',
              'Rotational motion and rigid body dynamics',
              'Gravitation',
              'Mechanics of solids and fluids',
              'Simple harmonic motion',
              'Waves and sound',
              'Thermal physics and calorimetry',
              'Kinetic theory and thermodynamics',
              'Electrostatics and capacitance',
              'Current electricity',
              'Magnetic effects of current and magnetism',
              'Electromagnetic induction and alternating current',
              'Geometrical optics',
              'Wave optics',
              'Modern physics — photoelectric effect, atoms and nuclei',
              'Experimental physics and error analysis',
            ],
          },
        ],
      },
      {
        subject: 'chemistry',
        specs: [
          {
            name: 'JEE Advanced Chemistry',
            topics: [
              'Basic concepts, stoichiometry and the mole concept',
              'Atomic structure',
              'States of matter — gaseous and liquid',
              'Chemical thermodynamics and thermochemistry',
              'Chemical and ionic equilibrium',
              'Solutions and colligative properties',
              'Electrochemistry',
              'Chemical kinetics',
              'Solid state',
              'Surface chemistry',
              'Nuclear chemistry',
              'Classification of elements and periodicity',
              'Hydrogen, s-Block and p-Block elements',
              'd- and f-Block elements',
              'Coordination compounds',
              'Metallurgy and extraction of metals',
              'Qualitative inorganic analysis',
              'Basic principles of organic chemistry and isomerism',
              'Hydrocarbons and halogen derivatives',
              'Oxygen- and nitrogen-containing organic compounds',
              'Biomolecules, polymers and practical organic chemistry',
            ],
          },
        ],
      },
      {
        subject: 'mathematics',
        specs: [
          {
            name: 'JEE Advanced Mathematics',
            topics: [
              'Sets, relations and functions',
              'Quadratic equations and complex numbers',
              'Sequences and series',
              'Logarithms, permutations and combinations',
              'Binomial theorem',
              'Matrices and determinants',
              'Probability',
              'Trigonometric functions and equations',
              'Inverse trigonometric functions and solution of triangles',
              'Analytical geometry — straight lines and circles',
              'Analytical geometry — conic sections',
              'Three dimensional geometry',
              'Vectors',
              'Limits, continuity and differentiability',
              'Differential calculus and applications of derivatives',
              'Integral calculus — indefinite and definite integrals',
              'Area under curves and differential equations',
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- NEET UG
  {
    qualId: 'neet-ug',
    board: 'nta',
    subjects: [
      {
        subject: 'physics',
        specs: [
          {
            name: 'NEET UG Physics',
            topics: [
              'Physics and measurement',
              'Kinematics',
              'Laws of motion',
              'Work, energy and power',
              'Motion of system of particles and rigid body',
              'Gravitation',
              'Properties of bulk matter',
              'Thermodynamics',
              'Behaviour of perfect gas and kinetic theory',
              'Oscillations and waves',
              'Electrostatics',
              'Current electricity',
              'Magnetic effects of current and magnetism',
              'Electromagnetic induction and alternating currents',
              'Electromagnetic waves',
              'Optics',
              'Dual nature of matter and radiation',
              'Atoms and nuclei',
              'Electronic devices',
              'Experimental skills',
            ],
          },
        ],
      },
      {
        subject: 'chemistry',
        specs: [
          {
            name: 'NEET UG Chemistry',
            topics: [
              'Some basic concepts of chemistry',
              'Structure of atom',
              'Classification of elements and periodicity in properties',
              'Chemical bonding and molecular structure',
              'Thermodynamics',
              'Equilibrium',
              'Redox reactions',
              'p-Block elements',
              'Organic chemistry — some basic principles and techniques',
              'Hydrocarbons',
              'Solutions',
              'Electrochemistry',
              'Chemical kinetics',
              'd- and f-Block elements',
              'Coordination compounds',
              'Haloalkanes and haloarenes',
              'Alcohols, phenols and ethers',
              'Aldehydes, ketones and carboxylic acids',
              'Amines',
              'Biomolecules',
            ],
          },
        ],
      },
      {
        subject: 'biology',
        specs: [
          {
            name: 'NEET UG Biology',
            topics: [
              'The living world and biological classification',
              'Plant kingdom and animal kingdom',
              'Morphology and anatomy of flowering plants',
              'Structural organisation in animals',
              'Cell — structure, function and cell cycle',
              'Biomolecules',
              'Transport, mineral nutrition and photosynthesis in plants',
              'Respiration in plants and plant growth and development',
              'Breathing, body fluids and circulation',
              'Excretory products, locomotion and movement',
              'Neural control and chemical coordination',
              'Digestion and absorption',
              'Sexual reproduction in flowering plants',
              'Human reproduction and reproductive health',
              'Principles of inheritance and variation',
              'Molecular basis of inheritance',
              'Evolution',
              'Human health and disease',
              'Microbes in human welfare',
              'Biotechnology — principles, processes and applications',
              'Organisms, populations and ecosystems',
              'Biodiversity and conservation',
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- TS EAMCET
  {
    qualId: 'ts-eamcet',
    board: 'tsche',
    subjects: [
      {
        subject: 'mathematics',
        specs: [{ name: 'TS EAMCET Mathematics', topics: EAMCET_MATHEMATICS_TOPICS }],
      },
      {
        subject: 'physics',
        specs: [{ name: 'TS EAMCET Physics', topics: EAMCET_PHYSICS_TOPICS }],
      },
      {
        subject: 'chemistry',
        specs: [{ name: 'TS EAMCET Chemistry', topics: EAMCET_CHEMISTRY_TOPICS }],
      },
      {
        subject: 'biology',
        specs: [{ name: 'TS EAMCET Biology', topics: EAMCET_BIOLOGY_TOPICS }],
      },
    ],
  },

  // ---------------------------------------------------------------- AP EAPCET
  {
    qualId: 'ap-eapcet',
    board: 'apsche',
    subjects: [
      {
        subject: 'mathematics',
        specs: [{ name: 'AP EAPCET Mathematics', topics: EAMCET_MATHEMATICS_TOPICS }],
      },
      {
        subject: 'physics',
        specs: [{ name: 'AP EAPCET Physics', topics: EAMCET_PHYSICS_TOPICS }],
      },
      {
        subject: 'chemistry',
        specs: [{ name: 'AP EAPCET Chemistry', topics: EAMCET_CHEMISTRY_TOPICS }],
      },
      {
        subject: 'biology',
        specs: [{ name: 'AP EAPCET Biology', topics: EAMCET_BIOLOGY_TOPICS }],
      },
    ],
  },

  // ---------------------------------------------------------------- MHT CET (Maharashtra)
  // PCM and PCB streams; Biology is examined for the pharmacy and agriculture routes.
  {
    qualId: 'mht-cet',
    board: 'mahacet',
    subjects: [
      { subject: 'mathematics', specs: [{ name: 'MHT CET Mathematics', topics: NCERT_MATHEMATICS_TOPICS }] },
      { subject: 'physics', specs: [{ name: 'MHT CET Physics', topics: NCERT_PHYSICS_TOPICS }] },
      { subject: 'chemistry', specs: [{ name: 'MHT CET Chemistry', topics: NCERT_CHEMISTRY_TOPICS }] },
      { subject: 'biology', specs: [{ name: 'MHT CET Biology', topics: NCERT_BIOLOGY_TOPICS }] },
    ],
  },

  // ---------------------------------------------------------------- KEAM (Kerala)
  // Engineering takes Physics, Chemistry and Mathematics; Biology is the pharmacy route.
  {
    qualId: 'keam',
    board: 'cee',
    subjects: [
      { subject: 'mathematics', specs: [{ name: 'KEAM Mathematics', topics: NCERT_MATHEMATICS_TOPICS }] },
      { subject: 'physics', specs: [{ name: 'KEAM Physics', topics: NCERT_PHYSICS_TOPICS }] },
      { subject: 'chemistry', specs: [{ name: 'KEAM Chemistry', topics: NCERT_CHEMISTRY_TOPICS }] },
      { subject: 'biology', specs: [{ name: 'KEAM Biology', topics: NCERT_BIOLOGY_TOPICS }] },
    ],
  },

  // ---------------------------------------------------------------- WBJEE (West Bengal)
  // Engineering only — the medical route moved to NEET — so there is no Biology paper.
  {
    qualId: 'wbjee',
    board: 'wbjeeb',
    subjects: [
      { subject: 'mathematics', specs: [{ name: 'WBJEE Mathematics', topics: NCERT_MATHEMATICS_TOPICS }] },
      { subject: 'physics', specs: [{ name: 'WBJEE Physics', topics: NCERT_PHYSICS_TOPICS }] },
      { subject: 'chemistry', specs: [{ name: 'WBJEE Chemistry', topics: NCERT_CHEMISTRY_TOPICS }] },
    ],
  },

  // ---------------------------------------------------------------- COMEDK UGET (Karnataka)
  // Engineering only since the dental and medical seats moved to NEET.
  {
    qualId: 'comedk',
    board: 'comedk',
    subjects: [
      { subject: 'mathematics', specs: [{ name: 'COMEDK UGET Mathematics', topics: NCERT_MATHEMATICS_TOPICS }] },
      { subject: 'physics', specs: [{ name: 'COMEDK UGET Physics', topics: NCERT_PHYSICS_TOPICS }] },
      { subject: 'chemistry', specs: [{ name: 'COMEDK UGET Chemistry', topics: NCERT_CHEMISTRY_TOPICS }] },
    ],
  },

  // ---------------------------------------------------------------- CUET UG
  // Unlike every other entrance exam here, the CUET domain syllabus is Class 12 only, so
  // these lists are the Class 12 NCERT chapters rather than the shared 11+12 ones.
  {
    qualId: 'cuet-ug',
    board: 'nta',
    subjects: [
      {
        subject: 'physics',
        specs: [
          {
            name: 'CUET UG Physics',
            topics: [
              'Electric charges and fields',
              'Electrostatic potential and capacitance',
              'Current electricity',
              'Moving charges and magnetism',
              'Magnetism and matter',
              'Electromagnetic induction',
              'Alternating current',
              'Electromagnetic waves',
              'Ray optics and optical instruments',
              'Wave optics',
              'Dual nature of radiation and matter',
              'Atoms',
              'Nuclei',
              'Semiconductor electronics',
            ],
          },
        ],
      },
      {
        subject: 'chemistry',
        specs: [
          {
            name: 'CUET UG Chemistry',
            topics: [
              'Solutions',
              'Electrochemistry',
              'Chemical kinetics',
              'd- and f-Block elements',
              'Coordination compounds',
              'Haloalkanes and haloarenes',
              'Alcohols, phenols and ethers',
              'Aldehydes, ketones and carboxylic acids',
              'Amines',
              'Biomolecules',
            ],
          },
        ],
      },
      {
        subject: 'mathematics',
        specs: [
          {
            name: 'CUET UG Mathematics',
            topics: [
              'Relations and functions',
              'Inverse trigonometric functions',
              'Matrices',
              'Determinants',
              'Continuity and differentiability',
              'Applications of derivatives',
              'Integrals',
              'Applications of integrals',
              'Differential equations',
              'Vector algebra',
              'Three dimensional geometry',
              'Linear programming',
              'Probability',
            ],
          },
        ],
      },
      {
        subject: 'biology',
        specs: [
          {
            name: 'CUET UG Biology',
            topics: [
              'Sexual reproduction in flowering plants',
              'Human reproduction',
              'Reproductive health',
              'Principles of inheritance and variation',
              'Molecular basis of inheritance',
              'Evolution',
              'Human health and disease',
              'Microbes in human welfare',
              'Biotechnology — principles and processes',
              'Biotechnology and its applications',
              'Organisms and populations',
              'Ecosystem',
              'Biodiversity and conservation',
            ],
          },
        ],
      },
      {
        subject: 'english language',
        specs: [
          {
            name: 'CUET UG English',
            topics: [
              'Reading comprehension — factual passages',
              'Reading comprehension — narrative passages',
              'Reading comprehension — literary passages',
              'Vocabulary in context',
              'Synonyms and antonyms',
              'Rearranging the parts',
              'Choosing the correct word',
            ],
          },
        ],
      },
      {
        subject: 'economics',
        specs: [
          {
            name: 'CUET UG Economics',
            topics: [
              'Introduction to microeconomics',
              'Consumer equilibrium and demand',
              'Producer behaviour and supply',
              'Forms of market and price determination',
              'National income and related aggregates',
              'Money and banking',
              'Determination of income and employment',
              'Government budget and the economy',
              'Balance of payments',
              'Indian economy on the eve of independence',
              'Liberalisation, privatisation and globalisation',
              'Poverty, human capital and employment',
              'Infrastructure, environment and sustainable development',
              'Development experience of India, Pakistan and China',
            ],
          },
        ],
      },
      {
        subject: 'history',
        specs: [
          {
            name: 'CUET UG History',
            topics: [
              'Bricks, beads and bones — the Harappan civilisation',
              'Kings, farmers and towns — early states and economies',
              'Kinship, caste and class — early societies',
              'Thinkers, beliefs and buildings — cultural developments',
              'Through the eyes of travellers',
              'Bhakti-Sufi traditions',
              'An imperial capital — Vijayanagara',
              'Peasants, zamindars and the state — Mughal India',
              'Kings and chronicles — the Mughal courts',
              'Colonialism and the countryside',
              'Rebels and the Raj — the revolt of 1857',
              'Colonial cities',
              'Mahatma Gandhi and the national movement',
              'Understanding partition',
              'Framing the constitution',
            ],
          },
        ],
      },
      {
        subject: 'political science',
        specs: [
          {
            name: 'CUET UG Political Science',
            topics: [
              'The cold war era',
              'The end of bipolarity',
              'US hegemony in world politics',
              'Alternative centres of power',
              'Contemporary South Asia',
              'International organisations',
              'Security in the contemporary world',
              'Environment and natural resources',
              'Globalisation',
              'Challenges of nation building',
              'Era of one-party dominance',
              'Politics of planned development',
              'India’s external relations',
              'Challenges to and restoration of the Congress system',
              'Crisis of the democratic order',
              'Regional aspirations and popular movements',
            ],
          },
        ],
      },
      {
        subject: 'business studies',
        specs: [
          {
            name: 'CUET UG Business Studies',
            topics: [
              'Nature and significance of management',
              'Principles of management',
              'Business environment',
              'Planning',
              'Organising',
              'Staffing',
              'Directing',
              'Controlling',
              'Financial management',
              'Financial markets',
              'Marketing management',
              'Consumer protection',
            ],
          },
        ],
      },
      {
        subject: 'accountancy',
        specs: [
          {
            name: 'CUET UG Accountancy',
            topics: [
              'Accounting for partnership firms — fundamentals',
              'Reconstitution of a partnership — admission of a partner',
              'Reconstitution — retirement and death of a partner',
              'Dissolution of a partnership firm',
              'Accounting for share capital',
              'Issue and redemption of debentures',
              'Financial statements of a company',
              'Analysis of financial statements',
              'Accounting ratios',
              'Cash flow statement',
              'Computerised accounting',
            ],
          },
        ],
      },
      {
        subject: 'general knowledge',
        specs: [
          {
            name: 'CUET UG General Test',
            topics: [
              'General knowledge — India and the world',
              'Current affairs — national and international',
              'General mental ability',
              'Numerical ability',
              'Quantitative reasoning',
              'Logical and analytical reasoning',
              'Data interpretation',
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- BITSAT
  {
    qualId: 'bitsat',
    board: 'bits',
    subjects: [
      { subject: 'physics', specs: [{ name: 'BITSAT Physics', topics: NCERT_PHYSICS_TOPICS }] },
      { subject: 'chemistry', specs: [{ name: 'BITSAT Chemistry', topics: NCERT_CHEMISTRY_TOPICS }] },
      { subject: 'mathematics', specs: [{ name: 'BITSAT Mathematics', topics: NCERT_MATHEMATICS_TOPICS }] },
      { subject: 'english proficiency', specs: [{ name: 'BITSAT English Proficiency', topics: ENTRANCE_ENGLISH_TOPICS }] },
      {
        subject: 'logical reasoning',
        specs: [
          {
            name: 'BITSAT Logical Reasoning',
            topics: [
              'Verbal reasoning — analogies',
              'Verbal reasoning — classification and odd one out',
              'Verbal reasoning — series completion',
              'Logical deduction and syllogisms',
              'Figure completion and pattern perception',
              'Figure formation and analysis',
              'Paper cutting and folding',
              'Figure matrix and rule detection',
              'Spatial visualisation and cubes',
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- VITEEE
  {
    qualId: 'viteee',
    board: 'vit',
    subjects: [
      { subject: 'physics', specs: [{ name: 'VITEEE Physics', topics: NCERT_PHYSICS_TOPICS }] },
      { subject: 'chemistry', specs: [{ name: 'VITEEE Chemistry', topics: NCERT_CHEMISTRY_TOPICS }] },
      { subject: 'mathematics', specs: [{ name: 'VITEEE Mathematics', topics: NCERT_MATHEMATICS_TOPICS }] },
      { subject: 'biology', specs: [{ name: 'VITEEE Biology', topics: NCERT_BIOLOGY_TOPICS }] },
      { subject: 'aptitude', specs: [{ name: 'VITEEE Aptitude', topics: ENTRANCE_APTITUDE_TOPICS }] },
      { subject: 'english proficiency', specs: [{ name: 'VITEEE English', topics: ENTRANCE_ENGLISH_TOPICS }] },
    ],
  },

  // ---------------------------------------------------------------- SRMJEEE
  {
    qualId: 'srmjeee',
    board: 'srm',
    subjects: [
      { subject: 'physics', specs: [{ name: 'SRMJEEE Physics', topics: NCERT_PHYSICS_TOPICS }] },
      { subject: 'chemistry', specs: [{ name: 'SRMJEEE Chemistry', topics: NCERT_CHEMISTRY_TOPICS }] },
      { subject: 'mathematics', specs: [{ name: 'SRMJEEE Mathematics', topics: NCERT_MATHEMATICS_TOPICS }] },
      { subject: 'biology', specs: [{ name: 'SRMJEEE Biology', topics: NCERT_BIOLOGY_TOPICS }] },
      { subject: 'aptitude', specs: [{ name: 'SRMJEEE Aptitude', topics: ENTRANCE_APTITUDE_TOPICS }] },
      { subject: 'english proficiency', specs: [{ name: 'SRMJEEE English', topics: ENTRANCE_ENGLISH_TOPICS }] },
    ],
  },

  // ---------------------------------------------------------------- CLAT
  {
    qualId: 'clat',
    board: 'nlu',
    subjects: [
      {
        subject: 'english language',
        specs: [
          {
            name: 'CLAT English Language',
            topics: [
              'Reading comprehension — inference and main idea',
              'Reading comprehension — tone, attitude and argument',
              'Vocabulary in context',
              'Summarising and paraphrasing',
              'Grammar and sentence correction',
            ],
          },
        ],
      },
      {
        subject: 'current affairs',
        specs: [
          {
            name: 'CLAT Current Affairs and General Knowledge',
            topics: [
              'Indian polity and governance in the news',
              'International affairs and treaties',
              'Economy and business in the news',
              'Awards, honours and appointments',
              'Sports, arts and culture',
              'Science, technology and environment in the news',
              'Historical events of continuing significance',
            ],
          },
        ],
      },
      {
        subject: 'legal reasoning',
        specs: [
          {
            name: 'CLAT Legal Reasoning',
            topics: [
              'Law of contracts',
              'Law of torts',
              'Criminal law',
              'Constitutional law and fundamental rights',
              'Family and personal law',
              'Legal maxims and terminology',
              'Applying a given legal principle to a set of facts',
              'Public international law and current legal developments',
            ],
          },
        ],
      },
      {
        subject: 'logical reasoning',
        specs: [
          {
            name: 'CLAT Logical Reasoning',
            topics: [
              'Identifying arguments, premises and conclusions',
              'Assumptions and inferences',
              'Strengthening and weakening an argument',
              'Analogies and relationships',
              'Logical sequencing and paradoxes',
              'Effect of new evidence on an argument',
            ],
          },
        ],
      },
      {
        subject: 'quantitative ability',
        specs: [
          {
            name: 'CLAT Quantitative Techniques',
            topics: [
              'Ratio, proportion and percentages',
              'Averages and mixtures',
              'Profit, loss and interest',
              'Time, speed, distance and work',
              'Data interpretation — tables, bar and pie charts',
              'Basic algebra and mensuration',
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- NDA
  // Paper 1 is Mathematics; Paper 2 is the General Ability Test, split here into its
  // English and General Knowledge halves so a student can practise them separately.
  {
    qualId: 'nda',
    board: 'upsc',
    subjects: [
      {
        subject: 'mathematics',
        specs: [
          {
            name: 'NDA Mathematics',
            topics: [
              'Sets, relations and functions',
              'Complex numbers and quadratic equations',
              'Binary numbers and number systems',
              'Permutations, combinations and binomial theorem',
              'Sequences and series',
              'Matrices and determinants',
              'Trigonometry and inverse trigonometric functions',
              'Heights and distances',
              'Analytical geometry — two dimensions',
              'Analytical geometry — three dimensions',
              'Vector algebra',
              'Differential calculus',
              'Applications of derivatives',
              'Integral calculus and differential equations',
              'Statistics',
              'Probability',
            ],
          },
        ],
      },
      {
        subject: 'english language',
        specs: [
          {
            name: 'NDA General Ability Test — English',
            topics: [
              'Grammar and usage',
              'Spotting errors',
              'Sentence improvement',
              'Vocabulary — synonyms and antonyms',
              'Idioms and phrases',
              'Ordering of words and sentences',
              'Comprehension and cloze',
            ],
          },
        ],
      },
      {
        subject: 'general knowledge',
        specs: [
          {
            name: 'NDA General Ability Test — General Knowledge',
            topics: [
              'Physics — mechanics, heat, light and sound',
              'Physics — electricity, magnetism and modern physics',
              'Chemistry — matter, reactions and everyday chemistry',
              'General science — biology, health and nutrition',
              'History — the Indian freedom movement and modern India',
              'History — world history and great movements',
              'Geography — physical geography and the earth',
              'Geography — India: climate, resources and regions',
              'Indian polity, constitution and governance',
              'Economy, planning and development',
              'Current events of national and international importance',
              'Defence, space and technology awareness',
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------- IPMAT
  {
    qualId: 'ipmat',
    board: 'iim',
    subjects: [
      {
        subject: 'quantitative ability',
        specs: [
          {
            name: 'IPMAT Quantitative Ability',
            topics: [
              'Number system and arithmetic operations',
              'Percentages, profit and loss',
              'Ratio, proportion and averages',
              'Time, speed, distance and work',
              'Simple and compound interest',
              'Algebra — equations and inequalities',
              'Sequences, series and progressions',
              'Permutations, combinations and probability',
              'Set theory and functions',
              'Logarithms and surds',
              'Geometry and mensuration',
              'Coordinate geometry',
              'Matrices and determinants',
              'Data interpretation — tables, charts and graphs',
            ],
          },
        ],
      },
      {
        subject: 'verbal ability',
        specs: [
          {
            name: 'IPMAT Verbal Ability',
            topics: [
              'Reading comprehension — inference and tone',
              'Vocabulary in context',
              'Synonyms, antonyms and word usage',
              'Grammar and error identification',
              'Sentence completion and fill in the blanks',
              'Para jumbles and paragraph completion',
              'Para summary',
              'Analogies and odd one out',
              'Critical reasoning in verbal contexts',
            ],
          },
        ],
      },
    ],
  },
];
