#@ SimpleGraphic
-- PoB Item Delta JSON-line bridge prototype.
--
-- Run from a compatible Path of Building Lua environment. The Node backend sends:
--   {"action":"load_build_xml","params":{"xml":"...","name":"..."}}
--   {"action":"get_stats","params":{"fields":["Life","EnergyShield"]}}
--
-- This file is repo-owned on purpose. Do not copy it into the PoB install unless
-- a user explicitly wants that; prefer POB_WRAPPER_PATH pointing here.

local currentEntry = nil
local compareEntryLoaded = false
local runtimeBootstrapped = false
local rendererBootstrapped = false

local function fallbackEncodeString(value)
	local text = tostring(value)
	text = text:gsub("\\", "\\\\")
	text = text:gsub('"', '\\"')
	text = text:gsub("\n", "\\n")
	text = text:gsub("\r", "\\r")
	text = text:gsub("\t", "\\t")
	return '"' .. text .. '"'
end

local function isArray(value)
	if type(value) ~= "table" then
		return false
	end
	local count = 0
	for key, _ in pairs(value) do
		if type(key) ~= "number" then
			return false
		end
		if key > count then
			count = key
		end
	end
	return count == #value
end

local function fallbackEncode(value)
	local valueType = type(value)
	if valueType == "nil" then
		return "null"
	elseif valueType == "number" then
		return tostring(value)
	elseif valueType == "boolean" then
		return value and "true" or "false"
	elseif valueType == "string" then
		return fallbackEncodeString(value)
	elseif valueType == "table" then
		local parts = {}
		if isArray(value) then
			for index = 1, #value do
				parts[#parts + 1] = fallbackEncode(value[index])
			end
			return "[" .. table.concat(parts, ",") .. "]"
		end
		for key, child in pairs(value) do
			parts[#parts + 1] = fallbackEncodeString(key) .. ":" .. fallbackEncode(child)
		end
		return "{" .. table.concat(parts, ",") .. "}"
	end
	return fallbackEncodeString(value)
end

local json = nil
local ok, module = pcall(require, "dkjson")
if ok and module then
	json = module
else
	ok, module = pcall(require, "lua.dkjson")
	if ok and module then
		json = module
	end
end

local function encode(value)
	if json and json.encode then
		local encodedOk, encoded = pcall(json.encode, value)
		if encodedOk and encoded then
			return encoded
		end
	end
	return fallbackEncode(value)
end

local function decode(line)
	if not json or not json.decode then
		return nil, "JSON decoder is unavailable; expected dkjson from the PoB runtime."
	end
	local decoded, _, err = json.decode(line)
	return decoded, err
end

local function send(value)
	io.write(encode(value), "\n")
	io.flush()
end

local function ensureLaunchStub()
	APP_NAME = APP_NAME or "Path of Building (PoE2)"
	launch = launch or {}
	if launch.devMode == nil then launch.devMode = false end
	if launch.devModeAlt == nil then launch.devModeAlt = false end
	if launch.installedMode == nil then launch.installedMode = true end
	if launch.noSSL == nil then launch.noSSL = false end
	if launch.versionNumber == nil then launch.versionNumber = "?" end
	if launch.versionBranch == nil then launch.versionBranch = nil end
	if launch.connectionProtocol == nil then launch.connectionProtocol = 0 end
	if launch.startTime == nil then launch.startTime = GetTime and GetTime() or 0 end
	if not launch.subScripts then launch.subScripts = {} end
	if not launch.RegisterSubScript then
		function launch:RegisterSubScript(id, callback)
			if id then
				self.subScripts[id] = { type = "CUSTOM", callback = callback }
			end
		end
	end
	if not launch.ShowErrMsg then
		function launch:ShowErrMsg(fmt, ...)
			error(string.format(fmt, ...))
		end
	end
end

local function loadHeadlessPassiveTree()
	if not latestTreeVersion then
		return "latestTreeVersion is unavailable."
	end
	if main.tree[latestTreeVersion] then
		return nil
	end

	local classOk, classOrError = pcall(LoadModule, "Classes/PassiveTree")
	if not classOk then
		return "Failed to load Classes/PassiveTree: " .. tostring(classOrError)
	end
	if not common or not common.classes or not common.classes.PassiveTree then
		return "PassiveTree class did not register."
	end

	common.classes.PassiveTree.LoadImage = function(_, _, data)
		if type(data) == "table" then
			data.handle = nil
			data.width = data.width or 0
			data.height = data.height or 0
		end
	end

	if data and data.setJewelRadiiGlobally then
		data.setJewelRadiiGlobally(latestTreeVersion)
	end

	local treeOk, treeOrError = pcall(new, "PassiveTree", latestTreeVersion)
	if not treeOk then
		return "Failed to construct latest passive tree: " .. tostring(treeOrError)
	end
	main.tree[latestTreeVersion] = treeOrError
	return nil
end

local function bootstrapRuntime()
	if type(LoadModule) ~= "function" then
		return "PoB LoadModule is unavailable. Launch this wrapper from a compatible PoB Lua runtime."
	end
	if runtimeBootstrapped and type(new) == "function" and type(main) == "table" then
		return nil
	end

	ensureLaunchStub()
	if not rendererBootstrapped and type(RenderInit) == "function" then
		local renderOk, renderOrError = pcall(RenderInit, "DPI_AWARE")
		if not renderOk then
			return "Failed to initialise PoB renderer: " .. tostring(renderOrError)
		end
		rendererBootstrapped = true
	end
	local loadedOk, loadedOrError = pcall(LoadModule, "Modules/Main")
	if not loadedOk then
		return "Failed to load Modules/Main: " .. tostring(loadedOrError)
	end
	if type(new) ~= "function" then
		return "PoB class constructor `new` is unavailable after loading Modules/Main."
	end
	if type(main) ~= "table" then
		return "PoB main object is unavailable after loading Modules/Main."
	end

	main.defaultCharLevel = main.defaultCharLevel or 1
	main.defaultItemAffixQuality = main.defaultItemAffixQuality or 0.5
	main.defaultItemQuality = main.defaultItemQuality or 20
	main.showThousandsSeparators = main.showThousandsSeparators ~= false
	main.thousandsSeparator = main.thousandsSeparator or ","
	main.decimalSeparator = main.decimalSeparator or "."
	main.showFlavourText = main.showFlavourText ~= false
	main.showAllItemAffixes = main.showAllItemAffixes ~= false
	main.notSupportedModTooltips = main.notSupportedModTooltips ~= false
	main.notSupportedTooltipText = main.notSupportedTooltipText or " ^8(Not supported in PoB yet)"
	main.slotOnlyTooltips = main.slotOnlyTooltips ~= false
	main.migrateAugments = main.migrateAugments ~= false
	main.portraitMode = false
	main.popups = main.popups or {}
	main.inputEvents = main.inputEvents or {}
	main.tooltipLines = main.tooltipLines or {}
	main.toastMessages = main.toastMessages or {}
	main.onFrameFuncs = main.onFrameFuncs or {}
	main.sharedItemList = main.sharedItemList or {}
	main.sharedItemSetList = main.sharedItemSetList or {}
	main.gameAccounts = main.gameAccounts or {}
	main.uniqueDB = main.uniqueDB or { list = {}, loading = nil }
	main.rareDB = main.rareDB or { list = {}, loading = nil }
	main.tree = main.tree or {}

	local treeError = loadHeadlessPassiveTree()
	if treeError then
		return treeError
	end

	runtimeBootstrapped = true
	return nil
end

local function ensureCompareEntry()
	local missing = bootstrapRuntime()
	if missing then
		return missing
	end
	if compareEntryLoaded then
		return nil
	end
	local loadedOk, err = pcall(LoadModule, "Classes/CompareEntry")
	if not loadedOk then
		return "Failed to load Classes/CompareEntry: " .. tostring(err)
	end
	compareEntryLoaded = true
	return nil
end

local function loadBuildXml(params)
	params = params or {}
	if type(params.xml) ~= "string" or params.xml == "" then
		return { ok = false, error = "load_build_xml requires params.xml." }
	end

	local err = ensureCompareEntry()
	if err then
		return { ok = false, error = err }
	end

	local createdOk, entryOrError = pcall(new, "CompareEntry", params.xml, params.name or "PoB Item Delta")
	if not createdOk then
		return { ok = false, error = "CompareEntry creation failed: " .. tostring(entryOrError) }
	end
	if not entryOrError or type(entryOrError.GetOutput) ~= "function" then
		return { ok = false, error = "CompareEntry did not expose GetOutput()." }
	end

	local output = entryOrError:GetOutput()
	if type(output) ~= "table" then
		return { ok = false, error = "CompareEntry loaded but produced no mainOutput stats." }
	end

	currentEntry = entryOrError
	return { ok = true }
end

local function getStats(params)
	if not currentEntry then
		return { ok = false, error = "No build loaded. Call load_build_xml first." }
	end

	local output = currentEntry:GetOutput()
	if type(output) ~= "table" then
		return { ok = false, error = "Loaded build has no output stats." }
	end

	local fields = params and params.fields or {}
	local stats = {}
	for _, field in ipairs(fields) do
		local value = output[field]
		if type(value) == "number" or type(value) == "string" or type(value) == "boolean" then
			stats[field] = value
		end
	end
	return { ok = true, stats = stats }
end

local function dispatch(request)
	if type(request) ~= "table" then
		return { ok = false, error = "Request must be a JSON object." }
	end
	if request.action == "ping" then
		return { ok = true, pong = true }
	elseif request.action == "load_build_xml" then
		return loadBuildXml(request.params)
	elseif request.action == "get_stats" then
		return getStats(request.params)
	elseif request.action == "quit" then
		return { ok = true, quit = true }
	end
	return { ok = false, error = "Unknown action: " .. tostring(request.action) }
end

send({
	ready = true,
	protocol = "pob-item-delta-json-lines",
	jsonAvailable = json ~= nil,
	runtimeAvailable = bootstrapRuntime() == nil,
})

while true do
	local line = io.read("*l")
	if not line then
		break
	end

	local request, err = decode(line)
	local response
	if not request then
		response = { ok = false, error = err or "Could not decode JSON request." }
	else
		local okDispatch, result = pcall(dispatch, request)
		if okDispatch then
			response = result
		else
			response = { ok = false, error = tostring(result) }
		end
	end

	local shouldQuit = response.quit == true
	response.quit = nil
	send(response)
	if shouldQuit then
		break
	end
end
