import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.get('/', (req, res) => res.send('API mínima OK'));
app.listen(PORT, () => console.log('Rodando na porta', PORT));
