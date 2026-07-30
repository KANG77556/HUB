import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['src/**/*.{ts,tsx}', '*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.main.json', './tsconfig.renderer.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  { ignores: ['dist/**', 'node_modules/**'] },
);
