import { z } from "zod";

/** Relative path inside the cloned repo. */
export const relativePathSchema = z.string();

export const listDirectoryInputSchema = z.object({
  path: z.string().default("."),
});

export const directoryEntrySchema = z.object({
  name: z.string(),
  type: z.enum(["file", "directory"]),
  size: z.number().int().nonnegative().optional(),
});

export const listDirectoryOutputSchema = z.object({
  entries: z.array(directoryEntrySchema),
});

export const readFileInputSchema = z.object({
  path: relativePathSchema,
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
});

export const readFileLineSchema = z.object({
  n: z.number().int().min(1),
  text: z.string(),
});

export const readFileOutputSchema = z.object({
  path: z.string(),
  lines: z.array(readFileLineSchema),
  truncated: z.boolean().optional(),
});

export const grepInputSchema = z.object({
  pattern: z.string().min(1),
  pathGlob: z.string().optional(),
});

export const grepMatchSchema = z.object({
  path: z.string(),
  line: z.number().int().min(1),
  text: z.string(),
});

export const grepOutputSchema = z.object({
  matches: z.array(grepMatchSchema),
  truncated: z.boolean().optional(),
});

export const findFilesInputSchema = z.object({
  glob: z.string().min(1),
});

export const findFilesOutputSchema = z.object({
  paths: z.array(z.string()),
  truncated: z.boolean().optional(),
});

export type ListDirectoryInput = z.infer<typeof listDirectoryInputSchema>;
export type ReadFileInput = z.infer<typeof readFileInputSchema>;
export type GrepInput = z.infer<typeof grepInputSchema>;
export type FindFilesInput = z.infer<typeof findFilesInputSchema>;
