(() => {
  const API_DB_ROOT = "/api/db";
  const API_STORAGE_ROOT = "/api/storage";

  function apiFetch(path, init = {}) {
    return fetch(path, {
      credentials: "same-origin",
      headers: {
        ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(init.headers || {}),
      },
      ...init,
    });
  }

  async function parseApiResponse(res) {
    const payload = await res.json().catch(() => ({ data: null, error: { message: `HTTP ${res.status}` } }));
    if (!res.ok && !payload.error) {
      payload.error = { message: `HTTP ${res.status}` };
    }
    return payload;
  }

  class QueryBuilder {
    constructor(table, mode = "query", values = null, options = {}) {
      this.table = table;
      this.mode = mode;
      this.values = values;
      this.options = options;
      this.filters = [];
      this.ordering = null;
      this.limitValue = null;
      this.singleValue = false;
      this.selectRequested = mode === "query";
    }

    select() {
      this.selectRequested = true;
      return this;
    }

    order(column, opts = {}) {
      this.ordering = { column, ascending: opts.ascending !== false };
      return this;
    }

    eq(column, value) {
      this.filters.push({ op: "eq", column, value });
      return this;
    }

    in(column, value) {
      this.filters.push({ op: "in", column, value });
      return this;
    }

    limit(value) {
      this.limitValue = value;
      return this;
    }

    single() {
      this.singleValue = true;
      this.limitValue = 1;
      return this;
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }

    async execute() {
      let body;
      if (this.mode === "query") {
        body = {
          action: "query",
          filters: this.filters,
          order: this.ordering,
          limit: this.limitValue,
          single: this.singleValue,
        };
      } else if (this.mode === "insert") {
        body = {
          action: "insert",
          values: this.values,
          select: this.selectRequested,
          single: this.singleValue,
        };
      } else if (this.mode === "update") {
        body = {
          action: "update",
          values: this.values,
          filters: this.filters,
          select: this.selectRequested,
          single: this.singleValue,
        };
      } else if (this.mode === "delete") {
        body = {
          action: "delete",
          filters: this.filters,
        };
      } else if (this.mode === "upsert") {
        body = {
          action: "upsert",
          values: this.values,
          onConflict: this.options.onConflict || null,
          select: this.selectRequested,
          single: this.singleValue,
        };
      }

      const res = await apiFetch(`${API_DB_ROOT}/${this.table}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return parseApiResponse(res);
    }
  }

  function createWorkerClient() {
    return {
      from(table) {
        return {
          select() {
            return new QueryBuilder(table, "query").select();
          },
          insert(values) {
            return new QueryBuilder(table, "insert", values);
          },
          update(values) {
            return new QueryBuilder(table, "update", values);
          },
          delete() {
            return new QueryBuilder(table, "delete");
          },
          upsert(values, options = {}) {
            return new QueryBuilder(table, "upsert", values, options);
          },
        };
      },
      storage: {
        from(bucket) {
          return {
            async list(prefix = "") {
              const res = await apiFetch(`${API_STORAGE_ROOT}/${bucket}/list?prefix=${encodeURIComponent(prefix)}`);
              return parseApiResponse(res);
            },
            getPublicUrl(path) {
              return {
                data: {
                  publicUrl: `${API_STORAGE_ROOT}/${bucket}/${encodeURIComponent(path).replace(/%2F/g, "/")}`,
                },
              };
            },
            async upload(path, file) {
              const formData = new FormData();
              formData.append("file", file);
              const res = await apiFetch(
                `${API_STORAGE_ROOT}/${bucket}/upload?path=${encodeURIComponent(path)}`,
                {
                  method: "POST",
                  body: formData,
                },
              );
              return parseApiResponse(res);
            },
          };
        },
      },
    };
  }

  window.supabase = {
    createClient() {
      return createWorkerClient();
    },
  };
})();
