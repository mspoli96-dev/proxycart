import { createRequire } from "node:module";

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = createRequire(import.meta.url)("fengari");

export class LuaRedis {
  at = Date.parse("2026-10-07T12:00:00Z");
  values = new Map<string, { value: string | Map<string, number>; expiresAt?: number }>();

  get(key: string): string | Map<string, number> | undefined {
    const entry = this.values.get(key);
    if (entry?.expiresAt !== undefined && entry.expiresAt <= this.at) { this.values.delete(key); return undefined; }
    return entry?.value;
  }

  private call(command: string, key: string, args: string[]): string | number | undefined {
    const value = this.get(key);
    switch (command) {
      case "GET": return typeof value === "string" ? value : undefined;
      case "EXISTS": return value === undefined ? 0 : 1;
      case "SET": this.values.set(key, { value: args[0], expiresAt: args[1] === "EX" ? this.at + Number(args[2]) * 1000 : undefined }); return "OK";
      case "INCR":
      case "INCRBY": {
        const next = Number(value ?? 0) + (command === "INCR" ? 1 : Number(args[0]));
        this.values.set(key, { ...this.values.get(key), value: String(next) });
        return next;
      }
      case "EXPIRE": {
        const entry = this.values.get(key);
        if (!entry) return 0;
        entry.expiresAt = this.at + Number(args[0]) * 1000;
        return 1;
      }
      case "DEL": return this.values.delete(key) ? 1 : 0;
      case "ZCARD": return value instanceof Map ? value.size : 0;
      case "ZADD": {
        const members = value instanceof Map ? value : new Map<string, number>();
        members.set(args[1], Number(args[0]));
        this.values.set(key, { ...this.values.get(key), value: members });
        return 1;
      }
      case "ZREM": return value instanceof Map && value.delete(args[0]) ? 1 : 0;
      case "ZREMRANGEBYSCORE": {
        let removed = 0;
        if (value instanceof Map) for (const [member, score] of value) if (score <= Number(args[1])) { value.delete(member); removed++; }
        return removed;
      }
      default: throw new Error(`Unsupported fixture command: ${command}`);
    }
  }

  eval = async (script: string, keys: string[], args: (string | number)[]): Promise<unknown> => {
    const state = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(state);
    const setArray = (name: string, values: (string | number)[]) => {
      lua.lua_newtable(state);
      values.forEach((value, index) => {
        lua.lua_pushstring(state, to_luastring(String(value)));
        lua.lua_rawseti(state, -2, index + 1);
      });
      lua.lua_setglobal(state, to_luastring(name));
    };
    setArray("KEYS", keys);
    setArray("ARGV", args);
    lua.lua_newtable(state);
    lua.lua_pushcfunction(state, () => {
      const count = lua.lua_gettop(state);
      const values = Array.from({ length: count }, (_, index) => to_jsstring(lua.lua_tostring(state, index + 1)) as string);
      const result = this.call(values[0], values[1], values.slice(2));
      if (result === undefined) lua.lua_pushboolean(state, false);
      else if (typeof result === "number") lua.lua_pushnumber(state, result);
      else lua.lua_pushstring(state, to_luastring(result));
      return 1;
    });
    lua.lua_setfield(state, -2, to_luastring("call"));
    lua.lua_setglobal(state, to_luastring("redis"));
    try {
      const code = lauxlib.luaL_dostring(state, to_luastring(script));
      if (code !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(state, -1)));
      return lua.lua_tonumber(state, -1) as number;
    } finally { lua.lua_close(state); }
  };
}
