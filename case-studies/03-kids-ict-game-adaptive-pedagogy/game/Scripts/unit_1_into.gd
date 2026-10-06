extends Node2D

const HAND_CURSOR: Texture2D = preload("res://Assets/handmouse.png")


# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	StarChart.hide_chart()
	Input.set_custom_mouse_cursor(HAND_CURSOR, Input.CURSOR_ARROW)


# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
	pass


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null, Input.CURSOR_ARROW)


func _on_video_stream_player_finished() -> void:
	get_tree().change_scene_to_file("res://Scenes/unit1-level1.tscn")
