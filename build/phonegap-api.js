// Phonegap Build API.
// See https://build.phonegap.com/docs/write_api

function curl() {
	var args = Array.prototype.slice.call(arguments);
	return exec("curl", args);
}

function listApps(config) {
	return JSON.parse(curl("-u", config.username+":"+config.password, "https://build.phonegap.com/api/v1/apps")).apps;
}

function readAppTitleFromConfigXml(sourceDir) {
	var configXml = readFileSync(sourceDir+'/config.xml');
	return configXml.match(/<name>([^<]+)/)[1];
}

function getApp(config) {
	var app,i;
	var list = listApps(config);
	for (i=0; i<list.length; i++) {
		app = list[i];
		if (app.title==config.title) {
			return app;
		}
	}
}

function getUser(config) {
	return JSON.parse(curl("-u", config.username+":"+config.password, "https://build.phonegap.com/api/v1/me"));
}

function findSignKeys(config) {
	var keyname = config.signkey;
	var userData = getUser(config);
	var keys = userData.keys;
	var result = {};
	for (var platform in keys) {
		var keyList = keys[platform].all;
		if (keyList) {
			for (var i=0; i<keyList.length; i++) {
				var key = keyList[i];
				if (key.title==config.signkey) {
					result[platform] = key.id;
					break;
				}
			}
		}
	}
	log("Found keys with name "+config.signkey+":"+JSON.stringify(result));
	return result;
}

function saveApp(config) {
	var url = "https://build.phonegap.com/api/v1/apps";
	var curlData = {
		create_method: 'file',
		keys: findSignKeys(config),
		title: config.title
	};
	var curlArgs = ["-u", config.username+":"+config.password, "-F", "file=@"+config.sourceFile,"-F","data="+JSON.stringify(curlData)];
	var appData = getApp(config);
	if (appData) {
		log("Updating app");
		url+="/"+appData.id;
		curlArgs.splice(0,0,"-X","PUT");
	} else {
		log("Creating app");
	}
	curlArgs.push(url);
	var res= curl.apply(this, curlArgs);
	return JSON.parse(res);
}

function getBuildStatus(config) {
	var status, platform, pending;
	var reslt = {};
	var status = getApp(config).status;
	pending = false;
	for (platform in status) {
		pending = pending || status[platform]=="pending";
	}
	return {
		pending: pending,
		platforms: status
	};
}

function waitForBuild(config) {
	var status;
	do {
		status = getBuildStatus(config);
		log("Waiting for build. Status: "+JSON.stringify(status.platforms));
		if (status.pending) {
			Thread.sleep(1000);
		}
	} while (status.pending);	
}

function getFileName(url) {
	var lastSlash = url.lastIndexOf('/');
	return url.substring(lastSlash+1);
}

function getPath(url) {
	var lastSlash = url.lastIndexOf('/');
	return url.substring(0, lastSlash);
}

function download(config) {
	var appData = getApp(config);
	var platforms = appData.status;
	var targetDir;
	for (var platform in platforms) {
		if (platforms[platform]=='complete') {
			var link = getDownloadLink(config, appData, platform);
			targetDir = config.targetDir+"/"+platform;
			mkdirs(targetDir);
			var targetFile = targetDir+"/"+getFileName(link);
			log("Downloading "+platform+" from "+link+" to "+targetFile);
			curl("-o", targetFile, link);
			if (platform=="blackberry") {
				// For blackberry: download the jad file and all linked files also
				downloadBlackberryCodFiles(config, link, targetFile);
			} else  if (platform=="ios") {
				// For ios: download ios manifest for wireless installation
				downloadIosWirelessManifest(config, appData);
			}
		}
	}
}

function getDownloadLink(config, appData, platform) {
	var linkHtml = curl("-u", config.username+":"+config.password, "https://build.phonegap.com/apps/"+appData.id+"/download/"+platform);
	return linkHtml.match(/href="([^"]+)/)[1];
}

function downloadBlackberryCodFiles(config, jadUrl, jadFileName) {
	var jadUrlPath = getPath(jadUrl);
	var jadFilePath = getPath(jadFileName);
	var jadContent = readFileSync(jadFileName);				
	var jadRegex = /RIM-COD-URL-\d+: (.*)/g;
	var match;
	while (match = jadRegex.exec(jadContent)) {
		var file = match[1];
		log("Downloading additional file "+file);
		curl("-o", jadFilePath+"/"+match[1], jadUrlPath+"/"+match[1]);
	}
}

function downloadIosWirelessManifest(config, appData) {
	log("Downloading iOS wireless install manifest");
	curl("-u", config.username+":"+config.password, "-o", config.targetDir+"/ios/auto-install.plist", "https://build.phonegap.com/apps/"+appData.id+"/plist");	
}
