// eslint.config.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";

import obsidianmd from "eslint-plugin-obsidianmd";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsFiles = [
	"**/*.ts",
	"**/*.tsx",
	"**/*.mts",
	"**/*.cts",
	"**/*.d.ts",
];

const tsTypeCheckedConfigs = tseslint.configs.recommendedTypeChecked.map(
	(config) => ({
		...config,
		files: tsFiles,
	}),
);

export default [
	{
		ignores: [
			"main.js",
			"dist/**",
			"docs/.obsidian/**",
			"node_modules/**",
			"tests/**",
			"**/*.mjs",
			"**/*.cjs",
			"manifest.json",
			"LICENSE",
		],
	},
	{
		files: ["**/*.{js,jsx}"],
		...js.configs.recommended,
	},
	{
		files: tsFiles,
		languageOptions: {
			parserOptions: {
				project: ["./tsconfig.json"],
				tsconfigRootDir: __dirname,
				sourceType: "module",
				ecmaVersion: 2020,
			},
		},
	},
	...tsTypeCheckedConfigs,
	{
		files: tsFiles,
		plugins: {
			obsidianmd,
		},
		rules: {
			// ObsidianReviewBot-aligned rules (subset)
			...obsidianmd.configs.recommended,
			"no-console": ["error", { allow: ["warn", "error", "debug"] }],
			"no-case-declarations": "error",
			"no-useless-escape": "error",

			"@typescript-eslint/no-base-to-string": "error",
			"@typescript-eslint/no-explicit-any": ["error", { fixToUnknown: true }],
			"no-restricted-syntax": [
				"error",
				{
					selector:
						"AssignmentExpression[left.type='MemberExpression'][left.property.type='Identifier'][left.property.name='innerHTML']",
					message:
						"Do not write to DOM directly using innerHTML/outerHTML property.",
				},
				{
					selector:
						"AssignmentExpression[left.type='MemberExpression'][left.property.type='Identifier'][left.property.name='outerHTML']",
					message:
						"Do not write to DOM directly using innerHTML/outerHTML property.",
				},
				{
					selector:
						"AssignmentExpression[left.type='MemberExpression'][left.computed=true][left.property.type='Literal'][left.property.value='innerHTML']",
					message:
						"Do not write to DOM directly using innerHTML/outerHTML property.",
				},
				{
					selector:
						"AssignmentExpression[left.type='MemberExpression'][left.computed=true][left.property.type='Literal'][left.property.value='outerHTML']",
					message:
						"Do not write to DOM directly using innerHTML/outerHTML property.",
				},
			],

			// Keep the existing behavior: allow ESLint to auto-fix UI sentence case.
			"obsidianmd/ui/sentence-case": [
				"warn",
				{
					allowAutoFix: true,
					enforceCamelCaseLower: false,
				},
			],
		},
	},
	{
		files: [
			"**/*.{js,cjs}",
			"scripts/**/*.js",
			"jest.config.js",
			"esbuild.config.mjs",
			"version-bump.mjs",
		],
		languageOptions: {
			globals: {
				module: "readonly",
				require: "readonly",
				__dirname: "readonly",
				process: "readonly",
				console: "readonly",
			},
		},
	},
	{
		files: ["**/*.d.ts"],
		rules: {
			// Declaration files commonly contain `any` and can't always be tightened easily.
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-return": "off",
		},
	},
];
