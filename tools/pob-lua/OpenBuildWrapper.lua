#@ SimpleGraphic
-- Opens a PoB Item Delta temporary build in the normal PoB UI without writing
-- the preview path back to Settings.xml.

local openBuildPath = os.getenv("POB_ITEM_DELTA_OPEN_BUILD_PATH")
local openBuildName = os.getenv("POB_ITEM_DELTA_OPEN_BUILD_NAME")
local disableSettingsSave = os.getenv("POB_ITEM_DELTA_DISABLE_SETTINGS_SAVE") == "1"

-- Main.lua treats arg[1] as a pob2:// website import URI. This wrapper uses
-- environment variables instead, so clear arg before the normal launcher starts.
arg = {}

local scriptPath = GetScriptPath and GetScriptPath() or "."
dofile(scriptPath .. "/Launch.lua")

local originalOnInit = launch.OnInit
function launch:OnInit(...)
	local result = originalOnInit(self, ...)
	if self.main and openBuildPath and openBuildPath ~= "" then
		self.main:SetMode("BUILD", openBuildPath, openBuildName or "PoB Item Delta Preview")
		self.main.newModeChangeToTree = true
		if disableSettingsSave then
			function self.main:SaveSettings()
				return nil
			end
		end
	end
	return result
end
