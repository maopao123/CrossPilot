import { ToolCategory, ToolDefinition } from '../contracts/tool.types.js';

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.id)) {
      console.warn(`[ToolRegistry] Overwriting already registered tool: ${tool.id}`);
    }
    this.tools.set(tool.id, tool);
  }

  get(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  has(id: string): boolean {
    return this.tools.has(id);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getAll().filter((tool) => tool.category === category);
  }

  listMetadata(): Array<Omit<ToolDefinition, 'execute'>> {
    return this.getAll().map(({ execute, ...meta }) => meta);
  }

  clear(): void {
    this.tools.clear();
  }
}
