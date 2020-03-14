.PHONY: deploy build

export PUBLIC_PATH=/mt-plugin-Squoosh/squoosh-sdk/0.0.2/

deploy:
	aws s3 sync --acl public-read build/ s3://mt-plugin-squoosh/build/
	gfind build -name '*.wasm' -exec aws s3api put-object --bucket mt-plugin-squoosh --key {} --body {} --content-type 'application/wasm' --acl public-read ';'

build:
	npm run build
