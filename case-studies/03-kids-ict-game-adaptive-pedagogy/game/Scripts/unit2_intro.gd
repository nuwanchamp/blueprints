extends Node2D

const NEXT_SCENE := "res://Scenes/unit2-level1.tscn"
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")


func _ready() -> void:
	StarChart.hide_chart()
	Input.set_custom_mouse_cursor(HAND_CURSOR)


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)


func _on_video_stream_player_finished() -> void:
	get_tree().change_scene_to_file(NEXT_SCENE)
