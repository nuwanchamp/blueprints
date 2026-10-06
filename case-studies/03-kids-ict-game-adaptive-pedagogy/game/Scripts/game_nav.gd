# =============================================================
#  Mouse Skills Adventure with Pip
#  GAME NAV  (autoload — global dev/navigation shortcuts)
#
#  Ctrl+N          -> next screen
#  Ctrl+P          -> previous screen
#  Ctrl+R          -> restart the current level
#  Ctrl+Shift+R    -> restart the whole game (resets StarChart)
#  Ctrl+M          -> jump straight to the unit menu
#
#  Works from any screen. Order below is the full play sequence,
#  title screen through the results screen.
#
#  Godot 4.x
# =============================================================
extends Node

const MENU_SCENE := "res://Scenes/unit-menu.tscn"

const SEQUENCE: Array[String] = [
	"res://Scenes/welcome.tscn",
	"res://Scenes/unit1-into.tscn",
	"res://Scenes/unit1-level1.tscn",
	"res://Scenes/unit1-level2.tscn",
	"res://Scenes/unit1-level3.tscn",
	"res://Scenes/unit1-level4.tscn",
	"res://Scenes/unit1-level5.tscn",
	"res://Scenes/unit1-level6.tscn",
	"res://Scenes/unit1-level7.tscn",
	"res://Scenes/unit1-level8.tscn",
	"res://Scenes/unit1-level9.tscn",
	"res://Scenes/unit1-level10.tscn",
	"res://Scenes/unit1-results.tscn",
]


func _unhandled_key_input(event: InputEvent) -> void:
	if not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo or not key.ctrl_pressed:
		return

	match key.keycode:
		KEY_N:
			_go_relative(1)
		KEY_P:
			_go_relative(-1)
		KEY_R:
			if key.shift_pressed:
				_restart_game()
			else:
				get_tree().reload_current_scene()
		KEY_M:
			get_tree().change_scene_to_file(MENU_SCENE)
		_:
			return
	get_viewport().set_input_as_handled()


func _current_index() -> int:
	var current := get_tree().current_scene
	if current == null:
		return -1
	return SEQUENCE.find(current.scene_file_path)


func _go_relative(step: int) -> void:
	var idx := _current_index()
	if idx < 0:
		return
	idx = clampi(idx + step, 0, SEQUENCE.size() - 1)
	get_tree().change_scene_to_file(SEQUENCE[idx])


func _restart_game() -> void:
	StarChart.reset()
	get_tree().change_scene_to_file(SEQUENCE[0])
