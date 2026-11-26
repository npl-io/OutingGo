import { env } from './config/env';
import { loadGraphStore, setGraphStore } from './engine/graphStore';
import { app } from './app';

try {
  setGraphStore(loadGraphStore(env.GRAPH_FILE));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}


app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
});
