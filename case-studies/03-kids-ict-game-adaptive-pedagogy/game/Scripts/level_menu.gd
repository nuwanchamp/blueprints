# =============================================================
#  RAINBOW ROOTS ACADEMY
#  LEVEL MENU  (choose any level within one unit)
#
#  Shared by unit1-level-menu.tscn and unit2-level-menu.tscn — set
#  `unit` per scene instance. Shows every level as a tappable tile;
#  every level is always open (no locking), matching how the game
#  already behaves today. Tapping a tile jumps straight to that
#  level's scene, skipping any intro video. Built procedurally,
#  same pattern as unit_1_results.gd / unit_2_results.gd.
#
#  Godot 4.x
# =============================================================
extends Node2D

@export var unit := 1   # 1 or 2 — set on the scene instance

const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

const COL_BG_UNIT1 := Color("fff0d6")   # Unit 1's warm cream (matches unit1-results.gd)
const COL_BG_UNIT2 := Color("e0f7f4")   # Unit 2's fresh mint (matches unit2-results.gd)

const TILE_SIZE := Vector2(160, 140)
const TILE_GAP := 16.0
const COLUMNS := 5

# level_number is the StarChart badge slot; -1 means this level never
# awards a star (the unit's "meet the mascot" orientation level).
const UNIT_1_LEVELS := [
	{"scene": "res://Scenes/unit1-level1.tscn", "level_number": -1, "title": "Meet Pip"},
	{"scene": "res://Scenes/unit1-level2.tscn", "level_number": 1, "title": "Magic Wiggle"},
	{"scene": "res://Scenes/unit1-level3.tscn", "level_number": 2, "title": "Pop the Balloons"},
	{"scene": "res://Scenes/unit1-level4.tscn", "level_number": 4, "title": "Corner Homes"},
	{"scene": "res://Scenes/unit1-level5.tscn", "level_number": 5, "title": "Follow the Trail"},
	{"scene": "res://Scenes/unit1-level6.tscn", "level_number": 6, "title": "Poke the Kitty"},
	{"scene": "res://Scenes/unit1-level7.tscn", "level_number": 7, "title": "Bubble Pop Party"},
	{"scene": "res://Scenes/unit1-level8.tscn", "level_number": 8, "title": "Catch Me If You Can"},
	{"scene": "res://Scenes/unit1-level9.tscn", "level_number": 9, "title": "Open Sesame"},
	{"scene": "res://Scenes/unit1-level10.tscn", "level_number": 10, "title": "Tidy Up with Pip"},
]

const UNIT_2_LEVELS := [
	{"scene": "res://Scenes/unit2-level1.tscn", "level_number": -1, "title": "Meet the Keyboard"},
	{"scene": "res://Scenes/unit2-level2.tscn", "level_number": 11, "title": "Light-Up Keys"},
	{"scene": "res://Scenes/unit2-level3.tscn", "level_number": 12, "title": "Space Jump"},
	{"scene": "res://Scenes/unit2-level4.tscn", "level_number": 13, "title": "Find the Letter"},
	{"scene": "res://Scenes/unit2-level5.tscn", "level_number": 14, "title": "Steer the Bunny"},
	{"scene": "res://Scenes/unit2-level6.tscn", "level_number": 15, "title": "Magic Enter"},
	{"scene": "res://Scenes/unit2-level7.tscn", "level_number": 16, "title": "Letter Parade"},
	{"scene": "res://Scenes/unit2-level8.tscn", "level_number": 17, "title": "Falling Letters"},
	{"scene": "res://Scenes/unit2-level9.tscn", "level_number": 18, "title": "Big Letters"},
	{"scene": "res://Scenes/unit2-level10.tscn", "level_number": 19, "title": "Word Builder"},
	{"scene": "res://Scenes/unit2-practice.tscn", "level_number": -1, "title": "⚡ Speed Practice"},
	{"scene": "res://Scenes/unit2-word-practice.tscn", "level_number": -1, "title": "🚂 Word Train"},
]


func _ready() -> void:
	StarChart.hide_chart()
	Input.set_custom_mouse_cursor(HAND_CURSOR)

	var bg := ColorRect.new()
	bg.color = COL_BG_UNIT1 if unit == 1 else COL_BG_UNIT2
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	var bg_layer := CanvasLayer.new()
	bg_layer.layer = -10
	bg_layer.add_child(bg)
	add_child(bg_layer)

	_build_ui()


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


func _levels() -> Array:
	return UNIT_1_LEVELS if unit == 1 else UNIT_2_LEVELS


func _build_ui() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)

	var title := RichTextLabel.new()
	title.bbcode_enabled = true
	title.fit_content = true
	title.scroll_active = false
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title.add_theme_font_override("normal_font", UI_FONT)
	title.add_theme_font_size_override("normal_font_size", 40)
	title.add_theme_color_override("font_outline_color", Color("1d4a46") if unit == 2 else Color("5a4a6b"))
	title.add_theme_constant_override("outline_size", 10)
	title.anchor_left = 0.05
	title.anchor_right = 0.95
	title.anchor_top = 0.03
	title.anchor_bottom = 0.13
	var unit_name := "Unit 1: Mouse Skills" if unit == 1 else "Unit 2: Keyboard Skills"
	title.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ unit_name
		+ "[/rainbow][/center]"
	)
	layer.add_child(title)

	var levels := _levels()
	var rows := ceili(float(levels.size()) / float(COLUMNS))
	var grid_w := COLUMNS * TILE_SIZE.x + (COLUMNS - 1) * TILE_GAP
	var grid_h := rows * TILE_SIZE.y + (rows - 1) * TILE_GAP
	var s := _screen_size()
	var left := s.x * 0.5 - grid_w * 0.5
	# The grid centers within the space BELOW the title/back-button strip,
	# never above it — centering across the whole screen instead let a
	# unit with enough tiles for a 3rd row (e.g. Unit 2's bonus practice
	# tile) push row 1 up underneath the title and back button.
	var grid_top_bound := s.y * 0.17
	var available_h := s.y - grid_top_bound - 30.0
	var top := grid_top_bound + maxf(0.0, (available_h - grid_h) * 0.5)

	for i in levels.size():
		var entry: Dictionary = levels[i]
		var col := i % COLUMNS
		var row := i / COLUMNS
		var pos := Vector2(left + col * (TILE_SIZE.x + TILE_GAP), top + row * (TILE_SIZE.y + TILE_GAP))
		_build_tile(layer, pos, i + 1, entry)

	_build_back_button(layer)


func _build_tile(layer: CanvasLayer, pos: Vector2, display_number: int, entry: Dictionary) -> void:
	var btn := Button.new()
	btn.position = pos
	btn.size = TILE_SIZE

	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(1, 1, 1, 1)
	normal.border_width_left = 4
	normal.border_width_top = 4
	normal.border_width_right = 4
	normal.border_width_bottom = 4
	normal.border_color = Color("2c6e68")
	normal.corner_radius_top_left = 16
	normal.corner_radius_top_right = 16
	normal.corner_radius_bottom_right = 16
	normal.corner_radius_bottom_left = 16
	normal.shadow_color = Color(0.158, 0.158, 0.158, 0.4)
	normal.shadow_size = 3
	normal.shadow_offset = Vector2(3, 4)
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color("ffe9b3")
	btn.add_theme_stylebox_override("normal", normal)
	btn.add_theme_stylebox_override("pressed", normal)
	btn.add_theme_stylebox_override("hover", hover)

	var scene_path: String = entry["scene"]
	btn.pressed.connect(func () -> void: get_tree().change_scene_to_file(scene_path))
	layer.add_child(btn)

	var number_label := Label.new()
	number_label.text = str(display_number)
	number_label.add_theme_font_override("font", UI_FONT)
	number_label.add_theme_font_size_override("font_size", 34)
	number_label.add_theme_color_override("font_color", Color("2c6e68"))
	number_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	number_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	number_label.anchor_left = 0.0
	number_label.anchor_right = 1.0
	number_label.anchor_top = 0.08
	number_label.anchor_bottom = 0.52
	btn.add_child(number_label)

	var title_label := Label.new()
	title_label.text = entry["title"]
	title_label.add_theme_font_size_override("font_size", 14)
	title_label.add_theme_color_override("font_color", Color("3a2e4d"))
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	title_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	title_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title_label.anchor_left = 0.08
	title_label.anchor_right = 0.92
	title_label.anchor_top = 0.54
	title_label.anchor_bottom = 0.86
	btn.add_child(title_label)

	var level_number: int = entry["level_number"]
	if level_number >= 0 and StarChart.has_star(level_number):
		var star_label := Label.new()
		star_label.text = "⭐"
		star_label.add_theme_font_size_override("font_size", 20)
		star_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		star_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		star_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		star_label.anchor_left = 0.72
		star_label.anchor_right = 1.0
		star_label.anchor_top = 0.0
		star_label.anchor_bottom = 0.26
		btn.add_child(star_label)


func _build_back_button(layer: CanvasLayer) -> void:
	var back_btn := Button.new()
	back_btn.text = "⬅  Units"
	back_btn.add_theme_font_override("font", UI_FONT)
	back_btn.add_theme_font_size_override("font_size", 24)
	back_btn.anchor_left = 0.0
	back_btn.anchor_top = 0.0
	back_btn.offset_left = 20
	back_btn.offset_top = 20
	back_btn.offset_right = 170
	back_btn.offset_bottom = 74

	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(1, 1, 1, 1)
	normal.border_width_left = 3
	normal.border_width_top = 3
	normal.border_width_right = 3
	normal.border_width_bottom = 3
	normal.border_color = Color(0.0018, 0.0018, 0.0018, 1)
	normal.corner_radius_top_left = 12
	normal.corner_radius_top_right = 12
	normal.corner_radius_bottom_right = 12
	normal.corner_radius_bottom_left = 12
	normal.shadow_color = Color(0.158, 0.158, 0.158, 0.6)
	normal.shadow_size = 2
	normal.shadow_offset = Vector2(3, 3)
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color("ffd166")
	back_btn.add_theme_stylebox_override("normal", normal)
	back_btn.add_theme_stylebox_override("pressed", normal)
	back_btn.add_theme_stylebox_override("hover", hover)
	back_btn.add_theme_color_override("font_color", Color("3a2e4d"))
	back_btn.add_theme_color_override("font_hover_color", Color("3a2e4d"))
	back_btn.add_theme_color_override("font_pressed_color", Color("3a2e4d"))
	back_btn.pressed.connect(func () -> void: get_tree().change_scene_to_file("res://Scenes/unit-menu.tscn"))
	layer.add_child(back_btn)
