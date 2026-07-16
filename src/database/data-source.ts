import 'dotenv/config';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { createTypeOrmOptions } from './typeorm-options';

const options = createTypeOrmOptions(process.env);

export default new DataSource(options as DataSourceOptions);
