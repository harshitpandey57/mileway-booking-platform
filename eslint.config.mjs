import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
export default tseslint.config({ ignores: ['**/node_modules/**','**/.next/**','**/out/**','**/dist/**','**/next-env.d.ts','**/playwright-report/**','**/test-results/**'] }, { files: ['**/*.{ts,tsx,js,mjs}'], languageOptions: { parser: tseslint.parser, globals: {...globals.node,...globals.browser} }, plugins: {'@typescript-eslint':tseslint.plugin,'react-hooks':reactHooks}, rules: {'no-debugger':'error','no-constant-binary-expression':'error','no-unreachable':'error','react-hooks/rules-of-hooks':'error'} });
