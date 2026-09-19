import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  ...coreWebVitals,
  ...nextTypescript,
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**'],
  },
  {
    // 生成パイプラインは「同じシードなら同じ曲」を保証する必要があるため、
    // 非決定的な乱数・時刻の混入を機械的に禁止する。
    // 乱数は必ず lib/random.ts の PRNG を、時刻は lib/seed.ts だけを使う。
    files: ['lib/music/**/*.ts', 'lib/audio/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            '決定性を壊すため禁止です。lib/random.ts の mulberry32 / forkRng を使ってください。',
        },
        {
          object: 'Date',
          property: 'now',
          message: '決定性を壊すため、生成パイプライン内では禁止です。',
        },
      ],
    },
  },
];

export default eslintConfig;
