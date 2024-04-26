import fs from 'fs';
import path from 'path';
import initSqlJs, { Database } from 'sql.js';
import { generateSettings } from '../settings';

class SQLiteConnection {
	filebuffer: any;
	db: any;

    constructor() {
        try {
			const settings = generateSettings();
			if (!fs.existsSync(settings.DATABASE_FILE_PATH)) {
				fs.openSync(settings.DATABASE_FILE_PATH, "w+");
			}
			this.filebuffer = fs.readFileSync(settings.DATABASE_FILE_PATH);
		
        } catch (err) {
            console.error("Error initializing SQLite database:", err);
        }
    }

	async setup() {
		const SQL = await initSqlJs({
			// Required to load the wasm binary asynchronously. Of course, you can host it wherever you want
			// You can omit locateFile completely when running in node
			locateFile: file => path.join(__dirname, ".." , `node_modules/sql.js/dist/${file}`)
		});
		this.db = new SQL.Database(this.filebuffer);
	}

    // static getInstance() {
    //     if (!SQLiteConnection.instance) {
    //         SQLiteConnection.instance = new SQLiteConnection();
    //     }
    //     return SQLiteConnection.instance;
    // }

    getDatabase() {
        return this.db;
    }

    disconnect() {
        try {
            if (this.db) {
                this.db.close();
            }
        } catch (err) {
            console.error("Error disconnecting SQLite database:", err);
        }
    }
}

module.exports = SQLiteConnection;
