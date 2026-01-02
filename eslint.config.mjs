// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
	{
		files: ["**/*.ts"],
		plugins: {
			obsidianmd,
		},
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				ecmaVersion: 2020,
				sourceType: "module",
			},
		},
		rules: {
			// Obsidian plugin rules (without type information)
			"obsidianmd/commands/no-plugin-id-in-command-id": "error",
			"obsidianmd/settings-tab/no-manual-html-headings": "error",
			"obsidianmd/settings-tab/no-problematic-settings-headings": "error",
			"obsidianmd/ui/sentence-case": [
				"warn",
				{
					allowAutoFix: true,
					enforceCamelCaseLower: false,
				},
			],
			"obsidianmd/no-sample-code": "warn",
		},
	},
	{
		ignores: [
			"main.js",
			"*.d.ts",
			"node_modules/**",
			"tests/**",
		],
	},
];
