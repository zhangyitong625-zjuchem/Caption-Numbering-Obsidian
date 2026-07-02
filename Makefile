.PHONY: install build local-deploy

install:
	npm install

# Compile plugin from main.ts to main.js
build:
	npm run dev

local-deploy:
	rm -rf ~/Library/CloudStorage/Dropbox/KPA\ Brain\ -\ Heading\ Tests/.obsidian/plugins/caption-numbering
	mkdir ~/Library/CloudStorage/Dropbox/KPA\ Brain\ -\ Heading\ Tests/.obsidian/plugins/caption-numbering
	cp main.js ~/Library/CloudStorage/Dropbox/KPA\ Brain\ -\ Heading\ Tests/.obsidian/plugins/caption-numbering/
	cp manifest.json ~/Library/CloudStorage/Dropbox/KPA\ Brain\ -\ Heading\ Tests/.obsidian/plugins/caption-numbering/
	cp styles.css ~/Library/CloudStorage/Dropbox/KPA\ Brain\ -\ Heading\ Tests/.obsidian/plugins/caption-numbering/

test:
	npm test